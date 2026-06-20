import type { GeneratedInsight, HouseholdFacts } from "./types.js";

const eur = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const price = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

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
  const betterLabel = better === "fixed" ? "Festtarif" : "dynamischen Tarif";
  return {
    type: "tariff_mismatch",
    severity: "high",
    period: "2025",
    title: `Tarif: rund ${eur(delta)} € pro Jahr zu viel`,
    detail: `Auf deinem aktuellen ${f.tariffType === "dynamic" ? "dynamischen Tarif" : "Festtarif"} zahlst du übers Jahr etwa ${eur(delta)} € mehr als auf einem ${betterLabel} bei gleichem Verbrauch.`,
    suggestedAction: `Wechsel auf einen ${betterLabel} prüfen.`,
    impactEur: delta,
  };
};

/** Positive confirmation when the current tariff is already the best choice. */
const tariffOptimal: Detector = (f) => {
  const delta = f.actualEnergyEur - Math.min(f.dynamicEnergyEur, f.fixedEnergyEur);
  if (delta > TARIFF_DELTA_THRESHOLD) return null;
  const otherLabel = f.tariffType === "dynamic" ? "Festtarif" : "dynamischen Tarif";
  return {
    type: "tariff_optimal",
    severity: "info",
    period: "2025",
    title: "Dein Tarif passt",
    detail: `Dein ${f.tariffType === "dynamic" ? "dynamischer Tarif" : "Festtarif"} ist für dein Verbrauchsprofil die günstigere Wahl — ein Wechsel auf einen ${otherLabel} würde dich nicht entlasten.`,
    suggestedAction: "Keine Aktion nötig.",
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
        title: `E-Auto clever laden spart rund ${eur(saving)} € pro Jahr`,
        detail: `Du lädst dein E-Auto im Schnitt für ${price(f.evAvgPrice)} €/kWh. Am günstigsten ist Strom um ${hour(f.cheapestHour)} (${price(f.cheapestHourPrice)} €/kWh) — am teuersten um ${hour(f.priciestHour)} (${price(f.priciestHourPrice)} €/kWh).`,
        suggestedAction: `Ladezeit auf das günstige Fenster um ${hour(f.cheapestHour)} legen.`,
        impactEur: saving,
      };
    }
    // Fixed tariff: price is constant, so the lever is self-consumption.
    return {
      type: "load_shift",
      severity: "info",
      period: "recurring",
      title: "E-Auto mit eigenem Solarstrom laden",
      detail:
        "In deinem Festtarif ändert die Uhrzeit den Preis nicht — aber mittags lädst du mit eigenem Solarstrom statt teurem Netzbezug.",
      suggestedAction: "E-Auto bevorzugt mittags bei Solarüberschuss laden.",
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
      title: "Flexible Verbraucher in günstige Stunden verschieben",
      detail: `Strom ist um ${hour(f.cheapestHour)} am günstigsten (${price(f.cheapestHourPrice)} €/kWh) und um ${hour(f.priciestHour)} am teuersten (${price(f.priciestHourPrice)} €/kWh).`,
      suggestedAction: `Spül-/Waschmaschine${f.hasHeatPump ? " und Wärmepumpen-Heizzeiten" : ""} in das günstige Fenster legen.`,
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
    title: `Höchste Rechnung im Monat ${peak.month}`,
    detail: `${peak.month} kostete ${eur(peak.totalBillEur)} € gegenüber deinem Tief von ${eur(low.totalBillEur)} € im Monat ${low.month} — meist getrieben durch Heizbedarf und weniger Solar.`,
    suggestedAction: "In sonnigen/günstigen Stunden vorheizen; Heizplan im Winter prüfen.",
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
    title: `Hohe Grundlast: rund ${eur(cost)} € pro Jahr`,
    detail: `Nachts ziehst du durchgehend etwa ${f.nightlyBaseloadKw.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW — das summiert sich über das Jahr.`,
    suggestedAction: "Dauerverbraucher im Standby identifizieren und abschalten.",
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
