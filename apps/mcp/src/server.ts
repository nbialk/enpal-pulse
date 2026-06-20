import { McpServer } from "skybridge/server";
import { z } from "zod";
import { prisma } from "./db.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

// Selectable household names (shown in the input dropdown). Resolved to ids in
// the handler so queries stay keyed by householdId.
const HOUSEHOLD_NAMES = [
  "Familie Becker",
  "Familie Schmidt",
  "Familie Yilmaz",
  "WG Sonnenallee",
] as const;

const server = new McpServer(
  { name: "enpal-energy-companion", version: "0.0.1" },
  { capabilities: {} },
).registerTool(
  {
    name: "daily-energy-flow",
    description:
      "Live energy-flow snapshot for one household at a given moment of a day: how solar splits into self-use, battery charging and grid export, plus grid import, battery discharge and state-of-charge. Defaults to today's date one year ago at the current time of day. Use to answer 'what's happening right now' / daily energy questions and to render the flow diagram.",
    inputSchema: {
      household: z
        .enum(HOUSEHOLD_NAMES)
        .describe("Household to inspect, selected by name."),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
          "Day as YYYY-MM-DD. Defaults to today's date one year ago (clamped to available data).",
        ),
    },
    annotations: { title: "Daily energy flow", ...readOnly },
    view: {
      component: "daily-energy-flow",
      description: "Live energy flow snapshot",
    },
  },
  async ({ household: householdName, date }) => {
    const household = await prisma.household.findFirstOrThrow({
      where: { name: householdName },
    });
    const householdId = household.householdId;

    // Available data range for this household.
    const range = await prisma.energyRecord.aggregate({
      where: { householdId },
      _min: { timestamp: true },
      _max: { timestamp: true },
    });
    const minTs = range._min.timestamp;
    const maxTs = range._max.timestamp;

    const toDay = (d: Date) => d.toISOString().slice(0, 10);

    // Default day: today shifted back one year, clamped into available range.
    let day = date;
    if (!day) {
      const now = new Date();
      const lastYear = `${now.getUTCFullYear() - 1}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
      const minDay = minTs ? toDay(minTs) : null;
      const maxDay = maxTs ? toDay(maxTs) : null;
      day =
        minDay && lastYear < minDay
          ? minDay
          : maxDay && lastYear > maxDay
            ? maxDay
            : lastYear;
    }

    const from = new Date(`${day}T00:00:00Z`);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);

    const records = await prisma.energyRecord.findMany({
      where: { householdId, timestamp: { gte: from, lt: to } },
      orderBy: { timestamp: "asc" },
    });

    if (records.length === 0) {
      const empty = {
        householdId,
        name: household.name,
        date: day,
        clock: "00:00",
        hasHeatPump: household.heatPump,
        hasEv: household.evCharger,
        snapshot: null,
        balance: null,
        priceContext: null as "cheap" | "typical" | "pricey" | null,
      };
      return {
        structuredContent: empty,
        content: `No energy records for ${household.name} on ${day}.`,
      };
    }

    // Fractional 15-min step index for the current wall-clock time of day.
    const now = new Date();
    const progress = Math.min(
      (now.getHours() * 60 + now.getMinutes()) / 15,
      records.length - 1,
    );
    const i0 = Math.floor(progress);
    const i1 = Math.min(i0 + 1, records.length - 1);
    const frac = progress - i0;
    const lerp = (a: number, b: number) => a + (b - a) * frac;

    const r0 = records[i0];
    const r1 = records[i1];
    const snapshot = {
      pv: lerp(r0.pvProductionKw, r1.pvProductionKw),
      consumption: lerp(r0.totalConsumptionKw, r1.totalConsumptionKw),
      houseLoad: lerp(r0.houseLoadKw, r1.houseLoadKw),
      heatpump: lerp(r0.heatpumpKw, r1.heatpumpKw),
      ev: lerp(r0.evChargingKw, r1.evChargingKw),
      gridImport: lerp(r0.gridImportKw, r1.gridImportKw),
      gridExport: lerp(r0.gridExportKw, r1.gridExportKw),
      batteryCharge: lerp(r0.batteryChargeKw, r1.batteryChargeKw),
      batteryDischarge: lerp(r0.batteryDischargeKw, r1.batteryDischargeKw),
      soc: lerp(r0.batterySocPct, r1.batterySocPct),
      socKwh: lerp(r0.batterySocKwh, r1.batterySocKwh),
      price: lerp(r0.priceEurPerKwh, r1.priceEurPerKwh),
    };

    // Energy totals from midnight up to the cursor (kWh = kW * 0.25).
    const full = Math.floor(progress);
    const acc = { pv: 0, consumption: 0, gridImport: 0, gridExport: 0 };
    for (let i = 0; i <= full && i < records.length; i++) {
      const weight = i < full ? 1 : frac;
      if (weight === 0) break;
      const rec = records[i];
      acc.pv += rec.pvProductionKw * weight;
      acc.consumption += rec.totalConsumptionKw * weight;
      acc.gridImport += rec.gridImportKw * weight;
      acc.gridExport += rec.gridExportKw * weight;
    }
    const pvKwh = acc.pv * 0.25;
    const gridExportKwh = acc.gridExport * 0.25;
    const balance = {
      pv: pvKwh,
      consumption: acc.consumption * 0.25,
      gridImport: acc.gridImport * 0.25,
      gridExport: gridExportKwh,
      selfConsumption: pvKwh > 0 ? ((pvKwh - gridExportKwh) / pvKwh) * 100 : 0,
    };

    // Classify the cursor price against the day's distribution.
    const sortedPrices = records
      .map((rec) => rec.priceEurPerKwh)
      .sort((a, b) => a - b);
    const p33 = sortedPrices[Math.floor(sortedPrices.length * 0.33)];
    const p66 = sortedPrices[Math.floor(sortedPrices.length * 0.66)];
    const priceContext: "cheap" | "typical" | "pricey" =
      snapshot.price <= p33 ? "cheap" : snapshot.price >= p66 ? "pricey" : "typical";

    const totalMin = Math.round(progress * 15);
    const clock = `${String(Math.floor(totalMin / 60) % 24).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;

    const round1 = (n: number) => Number(n.toFixed(1));
    const structuredContent = {
      householdId,
      name: household.name,
      date: day,
      clock,
      hasHeatPump: household.heatPump,
      hasEv: household.evCharger,
      snapshot: {
        pv: round1(snapshot.pv),
        consumption: round1(snapshot.consumption),
        houseLoad: round1(snapshot.houseLoad),
        heatpump: round1(snapshot.heatpump),
        ev: round1(snapshot.ev),
        gridImport: round1(snapshot.gridImport),
        gridExport: round1(snapshot.gridExport),
        batteryCharge: round1(snapshot.batteryCharge),
        batteryDischarge: round1(snapshot.batteryDischarge),
        soc: Math.round(snapshot.soc),
        socKwh: round1(snapshot.socKwh),
        price: Number(snapshot.price.toFixed(4)),
      },
      balance: {
        pv: Math.round(balance.pv),
        consumption: Math.round(balance.consumption),
        gridImport: Math.round(balance.gridImport),
        gridExport: Math.round(balance.gridExport),
        selfConsumption: Math.round(balance.selfConsumption),
      },
      priceContext,
    };

    const batteryState =
      snapshot.batteryCharge > 0.05
        ? `battery charging ${round1(snapshot.batteryCharge)} kW`
        : snapshot.batteryDischarge > 0.05
          ? `battery discharging ${round1(snapshot.batteryDischarge)} kW`
          : "battery idle";
    return {
      structuredContent,
      content: `${household.name} on ${day} at ${clock}: PV ${round1(snapshot.pv)} kW, consumption ${round1(snapshot.consumption)} kW, ${batteryState}, SoC ${Math.round(snapshot.soc)}%, price ${snapshot.price.toFixed(3)} EUR/kWh (${priceContext}).`,
    };
  },
);

export default await server.run();

export type AppType = typeof server;
