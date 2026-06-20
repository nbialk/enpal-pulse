export type InsightSeverity = "high" | "info";

export type InsightType =
  | "tariff_mismatch"
  | "tariff_optimal"
  | "load_shift"
  | "bill_spike"
  | "standby_load";

export type GeneratedInsight = {
  type: InsightType;
  severity: InsightSeverity;
  period: string;
  title: string;
  detail: string;
  suggestedAction: string;
  /** Estimated annual euro impact (savings potential or overspend). */
  impactEur: number;
};

/** Pre-aggregated facts an insight detector reasons over (no DB access). */
export type HouseholdFacts = {
  householdId: string;
  name: string;
  tariffType: "dynamic" | "fixed";
  hasEv: boolean;
  hasHeatPump: boolean;
  hasBattery: boolean;
  /** Annual import on the actual (current) tariff, in EUR. */
  actualEnergyEur: number;
  /** Annual import cost on the dynamic tariff, in EUR. */
  dynamicEnergyEur: number;
  /** Annual import cost on the fixed tariff, in EUR. */
  fixedEnergyEur: number;
  /** Annual EV charging energy, in kWh. */
  evKwh: number;
  /** Volume-weighted average price actually paid for EV charging, EUR/kWh. */
  evAvgPrice: number;
  /** Cheapest hour-of-day average price, EUR/kWh, and the hour (0-23). */
  cheapestHour: number;
  cheapestHourPrice: number;
  priciestHour: number;
  priciestHourPrice: number;
  /** Monthly total bills keyed by "YYYY-MM". */
  monthlyBills: { month: string; totalBillEur: number }[];
  /** Nightly baseload (min house-load over night hours), kW. */
  nightlyBaseloadKw: number;
};
