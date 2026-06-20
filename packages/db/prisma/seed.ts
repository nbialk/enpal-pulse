import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: join(__dirname, "..", "..", "..", ".env") });

const prisma = new PrismaClient();

const DATASET = join(__dirname, "..", "..", "..", "enpal-track-dataset");

function read<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATASET, file), "utf-8")) as T;
}

// Dataset timestamps are naive local strings. Treat them as UTC so each
// distinct string maps to a distinct instant (avoids DST collisions).
function toUtc(ts: string): Date {
  return new Date(`${ts}Z`);
}

const CHUNK = 5000;

async function chunked<T>(rows: T[], fn: (slice: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await fn(rows.slice(i, i + CHUNK));
  }
}

async function main() {
  console.log("Clearing existing data...");
  await prisma.energyRecord.deleteMany();
  await prisma.insightEvent.deleteMany();
  await prisma.monthlyBill.deleteMany();
  await prisma.dynamicPrice.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.household.deleteMany();
  await prisma.tariff.deleteMany();

  // Tariffs
  const tariffs = read<any[]>("tariffs.json");
  await prisma.tariff.createMany({
    data: tariffs.map((t) => ({
      tariffId: t.tariff_id,
      name: t.name,
      type: t.type,
      description: t.description,
      spotAdderEur: t.spot_adder_eur_per_kwh ?? null,
      energyRateEur: t.energy_rate_eur_per_kwh ?? null,
      baseFeeEur: t.base_fee_eur_per_month,
      feedInEur: t.feed_in_eur_per_kwh,
      priceSource: t.price_source ?? null,
    })),
  });
  console.log(`Seeded ${tariffs.length} tariffs`);

  // Households
  const households = read<any[]>("households.json");
  await prisma.household.createMany({
    data: households.map((h) => ({
      householdId: h.household_id,
      name: h.name,
      city: h.city,
      residents: h.residents,
      pvKwp: h.pv_kwp,
      batteryKwh: h.battery_kwh,
      batteryPowerKw: h.battery_power_kw,
      heatPump: h.heat_pump,
      evCharger: h.ev_charger,
      tariffId: h.tariff_id,
    })),
  });
  console.log(`Seeded ${households.length} households`);

  // Contracts
  const contracts = read<any[]>("contracts.json");
  await prisma.contract.createMany({
    data: contracts.map((c) => ({
      householdId: c.household_id,
      customerName: c.customer_name,
      city: c.supply_address.city,
      country: c.supply_address.country,
      provider: c.provider,
      tariffId: c.tariff_id,
      tariffName: c.tariff_name,
      contractStart: c.contract_start,
      contractEnd: c.contract_end,
      minimumTermMonths: c.minimum_term_months,
      noticePeriodWeeks: c.notice_period_weeks,
      autoRenewMonths: c.auto_renew_months,
      baseFeeEur: c.base_fee_eur_per_month,
      pricingModel: c.energy_pricing.model,
      spotAdderEur: c.energy_pricing.spot_adder_eur_per_kwh ?? null,
      feedInEur: c.feed_in_eur_per_kwh,
      assets: c.assets,
      contractTermsText: c.contract_terms_text,
    })),
  });
  console.log(`Seeded ${contracts.length} contracts`);

  // Dynamic prices
  const dynamic = read<{ prices: any[] }>("dynamic_prices.json");
  await chunked(dynamic.prices, (slice) =>
    prisma.dynamicPrice.createMany({
      data: slice.map((p) => ({
        timestamp: toUtc(p.timestamp),
        spotPriceEurPerKwh: p.spot_price_eur_per_kwh,
      })),
    }),
  );
  console.log(`Seeded ${dynamic.prices.length} dynamic prices`);

  // Monthly bills
  const bills = read<any[]>("monthly_bills.json");
  await prisma.monthlyBill.createMany({
    data: bills.map((b) => ({
      householdId: b.household_id,
      month: b.month,
      consumptionKwh: b.consumption_kwh,
      pvProductionKwh: b.pv_production_kwh,
      gridImportKwh: b.grid_import_kwh,
      gridExportKwh: b.grid_export_kwh,
      energyCostEur: b.energy_cost_eur,
      baseFeeEur: b.base_fee_eur,
      feedInCreditEur: b.feed_in_credit_eur,
      totalBillEur: b.total_bill_eur,
      selfSufficiencyPct: b.self_sufficiency_pct,
    })),
  });
  console.log(`Seeded ${bills.length} monthly bills`);

  // Insight events
  const insights = read<any[]>("insight_events.json");
  await prisma.insightEvent.createMany({
    data: insights.map((i) => ({
      householdId: i.household_id,
      type: i.type,
      severity: i.severity,
      period: i.period,
      title: i.title,
      detail: i.detail,
      suggestedAction: i.suggested_action,
    })),
  });
  console.log(`Seeded ${insights.length} insight events`);

  // Energy timeseries (large)
  for (const h of households) {
    const ts = read<{ records: any[] }>(h.timeseries_file);
    await chunked(ts.records, (slice) =>
      prisma.energyRecord.createMany({
        data: slice.map((r) => ({
          householdId: h.household_id,
          timestamp: toUtc(r.timestamp),
          outdoorTempC: r.outdoor_temp_c,
          pvProductionKw: r.pv_production_kw,
          houseLoadKw: r.house_load_kw,
          heatpumpKw: r.heatpump_kw,
          evChargingKw: r.ev_charging_kw,
          totalConsumptionKw: r.total_consumption_kw,
          batteryChargeKw: r.battery_charge_kw,
          batteryDischargeKw: r.battery_discharge_kw,
          batterySocKwh: r.battery_soc_kwh,
          batterySocPct: r.battery_soc_pct,
          gridImportKw: r.grid_import_kw,
          gridExportKw: r.grid_export_kw,
          priceEurPerKwh: r.price_eur_per_kwh,
        })),
      }),
    );
    console.log(`Seeded ${ts.records.length} energy records for ${h.household_id}`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
