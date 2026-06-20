import type { GeneratedInsight, HouseholdFacts } from "./types.js";

const eur = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const price = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
/** "2025-08" → "August 2025" */
const monthLabel = (ym: string) => {
  const [year, month] = ym.split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return name ? `${name} ${year}` : ym;
};

/** A detector returns an insight when its rule fires, otherwise null. */
type Detector = (f: HouseholdFacts) => GeneratedInsight | null;

// Minimum annual euro delta before we flag a tariff as the wrong choice.
const TARIFF_DELTA_THRESHOLD = 20;
// A month is a "spike" if it exceeds the yearly median by this factor.
const BILL_SPIKE_FACTOR = 1.5;
// Nightly baseload above this (kW) is worth flagging as standby waste.
const STANDBY_KW_THRESHOLD = 0.12;

/**
 * Tariff counterfactual: would the household be cheaper on the other tariff?
 * Fires only when the current tariff is the more expensive choice.
 */
const tariffMismatch: Detector = (f) => {
  const delta = f.actualEnergyEur - Math.min(f.dynamicEnergyEur, f.fixedEnergyEur);
  if (delta <= TARIFF_DELTA_THRESHOLD) return null;
  const better = f.tariffType === "dynamic" ? "fixed" : "dynamic";
  const betterLabel = better === "fixed" ? "fixed tariff" : "dynamic tariff";
  return {
    type: "tariff_mismatch",
    severity: "high",
    period: "2025",
    title: `Tariff: about €${eur(delta)} too much per year`,
    detail: `On your current ${f.tariffType === "dynamic" ? "dynamic tariff" : "fixed tariff"} you pay roughly €${eur(delta)} more over the year than you would on a ${betterLabel} for the same consumption.`,
    suggestedAction: `Consider switching to a ${betterLabel}.`,
    impactEur: delta,
  };
};

/** Positive confirmation when the current tariff is already the best choice. */
const tariffOptimal: Detector = (f) => {
  const delta = f.actualEnergyEur - Math.min(f.dynamicEnergyEur, f.fixedEnergyEur);
  if (delta > TARIFF_DELTA_THRESHOLD) return null;
  const otherLabel = f.tariffType === "dynamic" ? "fixed tariff" : "dynamic tariff";
  return {
    type: "tariff_optimal",
    severity: "info",
    period: "2025",
    title: "Your tariff fits",
    detail: `Your ${f.tariffType === "dynamic" ? "dynamic tariff" : "fixed tariff"} is the cheaper choice for your consumption profile — switching to a ${otherLabel} would not save you anything.`,
    suggestedAction: "No action needed.",
    impactEur: 0,
  };
};

/**
 * Load-shift nudge. The mechanism depends on tariff + assets:
 *  - dynamic + EV  → shift EV charging into the cheapest price window
 *  - fixed + EV    → shift EV charging into PV-surplus hours (own solar)
 *  - dynamic, no EV → shift flexible household/heat-pump load by price
 */
const loadShift: Detector = (f) => {
  if (f.hasEv && f.evKwh > 0) {
    if (f.tariffType === "dynamic") {
      const saving = f.evKwh * (f.evAvgPrice - f.cheapestHourPrice);
      if (saving <= TARIFF_DELTA_THRESHOLD) return null;
      return {
        type: "load_shift",
        severity: "high",
        period: "recurring",
        title: `Smart EV charging saves about €${eur(saving)} per year`,
        detail: `You charge your EV at an average of €${price(f.evAvgPrice)}/kWh. Electricity is cheapest at ${hour(f.cheapestHour)} (€${price(f.cheapestHourPrice)}/kWh) — and most expensive at ${hour(f.priciestHour)} (€${price(f.priciestHourPrice)}/kWh).`,
        suggestedAction: `Move charging to the cheap window around ${hour(f.cheapestHour)}.`,
        impactEur: saving,
      };
    }
    // Fixed tariff: price is constant, so the lever is self-consumption.
    return {
      type: "load_shift",
      severity: "info",
      period: "recurring",
      title: "Charge your EV with your own solar power",
      detail:
        "On your fixed tariff the time of day does not change the price — but at midday you charge with your own solar power instead of expensive grid electricity.",
      suggestedAction: "Charge the EV preferably at midday during solar surplus.",
      impactEur: 0,
    };
  }

  // No EV: the flexible lever is household / heat-pump timing under a dynamic tariff.
  if (f.tariffType === "dynamic") {
    const spread = f.priciestHourPrice - f.cheapestHourPrice;
    if (spread < 0.1) return null;
    return {
      type: "load_shift",
      severity: "info",
      period: "recurring",
      title: "Shift flexible loads into cheap hours",
      detail: `Electricity is cheapest at ${hour(f.cheapestHour)} (€${price(f.cheapestHourPrice)}/kWh) and most expensive at ${hour(f.priciestHour)} (€${price(f.priciestHourPrice)}/kWh).`,
      suggestedAction: `Run the dishwasher/washing machine${f.hasHeatPump ? " and heat-pump heating times" : ""} during the cheap window.`,
      impactEur: 0,
    };
  }

  return null;
};

/** Bill spike: highlight the most expensive month relative to the median. */
const billSpike: Detector = (f) => {
  if (f.monthlyBills.length < 3) return null;
  const sorted = [...f.monthlyBills].sort((a, b) => a.totalBillEur - b.totalBillEur);
  const median = sorted[Math.floor(sorted.length / 2)]!.totalBillEur;
  const peak = sorted[sorted.length - 1]!;
  const low = sorted[0]!;
  if (median <= 0 || peak.totalBillEur / median < BILL_SPIKE_FACTOR) return null;
  return {
    type: "bill_spike",
    severity: "info",
    period: peak.month,
    title: `Highest bill in ${monthLabel(peak.month)}`,
    detail: `${monthLabel(peak.month)} cost €${eur(peak.totalBillEur)} compared with your low of €${eur(low.totalBillEur)} in ${monthLabel(low.month)} — usually driven by heating demand and less solar.`,
    suggestedAction: "Pre-heat during sunny/cheap hours; review your heating schedule in winter.",
    impactEur: peak.totalBillEur - median,
  };
};

/** High standby/baseload draw at night. */
const standbyLoad: Detector = (f) => {
  if (f.nightlyBaseloadKw <= STANDBY_KW_THRESHOLD) return null;
  // Rough annual cost of the baseload at the average paid import price.
  const annualKwh = f.nightlyBaseloadKw * 24 * 365;
  const avgPrice =
    f.tariffType === "dynamic"
      ? (f.cheapestHourPrice + f.priciestHourPrice) / 2
      : f.cheapestHourPrice;
  const cost = annualKwh * avgPrice;
  return {
    type: "standby_load",
    severity: "info",
    period: "recurring",
    title: `High baseload: about €${eur(cost)} per year`,
    detail: `At night you continuously draw about ${f.nightlyBaseloadKw.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW — this adds up over the year.`,
    suggestedAction: "Identify and switch off constant standby consumers.",
    impactEur: cost,
  };
};

const DETECTORS: Detector[] = [
  tariffMismatch,
  tariffOptimal,
  loadShift,
  billSpike,
  standbyLoad,
];

const SEVERITY_RANK: Record<GeneratedInsight["severity"], number> = {
  high: 0,
  info: 1,
};

/**
 * Run every detector over a household's facts and return the firing insights,
 * sorted by severity then by annual euro impact (most impactful first).
 */
export function detectInsights(facts: HouseholdFacts): GeneratedInsight[] {
  return DETECTORS.map((d) => d(facts))
    .filter((i): i is GeneratedInsight => i !== null)
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.impactEur - a.impactEur,
    );
}
