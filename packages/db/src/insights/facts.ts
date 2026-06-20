import type { PrismaClient } from "../../generated/prisma/client.js";
import type { HouseholdFacts } from "./types.js";

const STEP_HOURS = 0.25; // 15-minute records → kWh = kW * 0.25

/**
 * Build pre-aggregated facts for one household from the raw timeseries and
 * tariff table. This is the only insight code that touches the database;
 * detectors operate purely on the returned facts.
 */
export async function buildHouseholdFacts(
  prisma: PrismaClient,
  householdId: string,
): Promise<HouseholdFacts | null> {
  const household = await prisma.household.findUnique({
    where: { householdId },
  });
  if (!household) return null;

  const [dynamicTariff, fixedTariff] = await Promise.all([
    prisma.tariff.findFirst({ where: { type: "dynamic" } }),
    prisma.tariff.findFirst({ where: { type: "fixed" } }),
  ]);

  const fixedRate = fixedTariff?.energyRateEur ?? 0.349;
  const fixedBaseFee = fixedTariff?.baseFeeEur ?? 11.5;
  const dynamicBaseFee = dynamicTariff?.baseFeeEur ?? 12.9;

  // Stream the timeseries once, aggregating everything we need.
  const records = await prisma.energyRecord.findMany({
    where: { householdId },
    select: {
      timestamp: true,
      priceEurPerKwh: true,
      gridImportKw: true,
      evChargingKw: true,
      houseLoadKw: true,
    },
    orderBy: { timestamp: "asc" },
  });

  let dynamicEnergyEur = 0;
  let fixedImportKwh = 0;
  let evKwh = 0;
  let evCostEur = 0;

  // Plain hour-of-day price average (every record), used for the load-shift
  // window — robust against import-weighting that skews toward outlier hours.
  const hourPriceSum = new Array(24).fill(0);
  const hourPriceCount = new Array(24).fill(0);
  let nightlyBaseloadKw = Infinity;

  for (const r of records) {
    const importKwh = r.gridImportKw * STEP_HOURS;
    dynamicEnergyEur += importKwh * r.priceEurPerKwh;
    fixedImportKwh += importKwh;

    const evStepKwh = r.evChargingKw * STEP_HOURS;
    if (evStepKwh > 0) {
      evKwh += evStepKwh;
      evCostEur += evStepKwh * r.priceEurPerKwh;
    }

    const h = r.timestamp.getUTCHours();
    hourPriceSum[h] += r.priceEurPerKwh;
    hourPriceCount[h] += 1;

    // Nightly baseload proxy: minimum house load during 01:00–04:00.
    if (h >= 1 && h <= 4 && r.houseLoadKw < nightlyBaseloadKw) {
      nightlyBaseloadKw = r.houseLoadKw;
    }
  }

  const monthsCount =
    (await prisma.monthlyBill.count({ where: { householdId } })) || 12;
  const fixedEnergyEur = fixedImportKwh * fixedRate + fixedBaseFee * monthsCount;
  const dynamicTotalEur = dynamicEnergyEur + dynamicBaseFee * monthsCount;

  const tariffType = household.tariffId === "fixed" ? "fixed" : "dynamic";
  const actualEnergyEur =
    tariffType === "fixed" ? fixedEnergyEur : dynamicTotalEur;

  // Hour-of-day average price profile (plain mean across all records).
  let cheapestHour = 0;
  let priciestHour = 0;
  let cheapestHourPrice = Infinity;
  let priciestHourPrice = -Infinity;
  for (let h = 0; h < 24; h++) {
    if (hourPriceCount[h] === 0) continue;
    const avg = hourPriceSum[h] / hourPriceCount[h];
    if (avg < cheapestHourPrice) {
      cheapestHourPrice = avg;
      cheapestHour = h;
    }
    if (avg > priciestHourPrice) {
      priciestHourPrice = avg;
      priciestHour = h;
    }
  }
  if (!Number.isFinite(cheapestHourPrice)) cheapestHourPrice = fixedRate;
  if (!Number.isFinite(priciestHourPrice)) priciestHourPrice = fixedRate;

  const bills = await prisma.monthlyBill.findMany({
    where: { householdId },
    select: { month: true, totalBillEur: true },
    orderBy: { month: "asc" },
  });

  return {
    householdId,
    name: household.name,
    tariffType,
    hasEv: household.evCharger,
    hasHeatPump: household.heatPump,
    hasBattery: household.batteryKwh > 0,
    actualEnergyEur,
    dynamicEnergyEur: dynamicTotalEur,
    fixedEnergyEur,
    evKwh,
    evAvgPrice: evKwh > 0 ? evCostEur / evKwh : 0,
    cheapestHour,
    cheapestHourPrice,
    priciestHour,
    priciestHourPrice,
    monthlyBills: bills,
    nightlyBaseloadKw: Number.isFinite(nightlyBaseloadKw) ? nightlyBaseloadKw : 0,
  };
}
