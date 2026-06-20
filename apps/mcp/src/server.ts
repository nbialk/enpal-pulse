import { McpServer } from "skybridge/server";
import { z } from "zod";
import { prisma, Prisma } from "./db.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

type MonthlyConsumption = {
  month: string;
  monthLabel: string;
  houseKwh: number;
  heatpumpKwh: number;
  evKwh: number;
  totalKwh: number;
};

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
        .default("Familie Becker")
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

    // Current time in German wall-clock time (the server runs in UTC).
    const berlinNow = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const part = (t: string) => berlinNow.find((p) => p.type === t)!.value;
    const berlinYear = Number(part("year"));
    const berlinHour = Number(part("hour"));
    const berlinMinute = Number(part("minute"));

    // Default day: today (Berlin) shifted back one year, clamped to range.
    let day = date;
    if (!day) {
      const lastYear = `${berlinYear - 1}-${part("month")}-${part("day")}`;
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
        dateLabel: new Intl.DateTimeFormat("en-GB", {
          timeZone: "UTC",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(`${day}T00:00:00Z`)),
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

    // Fractional 15-min step index for the current German wall-clock time.
    const progress = Math.min(
      (berlinHour * 60 + berlinMinute) / 15,
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

    // Human-readable German date, e.g. "20. Juni 2025".
    const dateLabel = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${day}T00:00:00Z`));

    const round1 = (n: number) => Number(n.toFixed(1));
    const structuredContent = {
      householdId,
      name: household.name,
      date: day,
      dateLabel,
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
).registerTool(
  {
    name: "explain-bill",
    description:
      "Explain a household's monthly bill: decomposes the euro difference between two months into drivers (energy cost, feed-in credit, base fee) and renders a stacked bar chart of consumption by area (house load, heat pump, EV) per month. Use for 'Why was my bill higher this month?', 'Compare the last 3 months', or 'Compare January and June'. To compare two specific named months, set BOTH `month` and `compareMonth` to those months (resolve the year yourself); the chart then shows exactly those two months.",
    inputSchema: {
      household: z
        .enum(HOUSEHOLD_NAMES)
        .default("Familie Becker")
        .describe("Household to inspect, selected by name."),
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional()
        .describe(
          "Target month to explain as YYYY-MM. For a two-month comparison, set this to one of the requested months (resolve the year yourself). Defaults to the most recent available month.",
        ),
      compareMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional()
        .describe(
          "Reference month as YYYY-MM for the driver breakdown. For a two-month comparison, set this to the other requested month (resolve the year yourself); the chart then shows exactly `month` and `compareMonth`. Defaults to the previous month.",
        ),
      months: z
        .number()
        .int()
        .min(1)
        .max(12)
        .default(3)
        .describe(
          "How many of the most recent months to chart (e.g. 3 = last 3 months). 1 keeps the before/after card; >=2 shows a stacked monthly consumption chart.",
        ),
    },
    annotations: { title: "Explain bill", ...readOnly },
    view: { component: "explain-bill", description: "Bill driver breakdown" },
  },
  async ({ household: householdName, month, compareMonth, months }) => {
    const household = await prisma.household.findFirstOrThrow({
      where: { name: householdName },
    });
    const householdId = household.householdId;

    const bills = await prisma.monthlyBill.findMany({
      where: { householdId },
      orderBy: { month: "asc" },
    });

    const monthLabelDe = (ym: string) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
      }).format(new Date(`${ym}-01T00:00:00Z`));
    const eur = (n: number) =>
      new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(n);

    if (bills.length < 2) {
      const empty = {
        householdId,
        name: household.name,
        month: null,
        monthLabel: null,
        compareMonth: null,
        compareLabel: null,
        totalEur: 0,
        compareTotalEur: 0,
        deltaEur: 0,
        mainReason: null as string | null,
        drivers: [] as never[],
        monthlyConsumption: [] as MonthlyConsumption[],
        context: null,
      };
      return {
        structuredContent: empty,
        content: `Not enough monthly bills for ${household.name} to compare.`,
      };
    }

    // Target month: requested, else the most recent available month.
    const byMonth = new Map(bills.map((b) => [b.month, b]));
    const target = (month && byMonth.get(month)) || bills[bills.length - 1];

    // Reference month: requested, else previous month, else yearly median.
    const idx = bills.findIndex((b) => b.month === target.month);
    let reference =
      (compareMonth && byMonth.get(compareMonth)) ||
      (idx > 0 ? bills[idx - 1] : undefined);
    if (!reference) {
      const sorted = [...bills].sort((a, b) => a.totalBillEur - b.totalBillEur);
      reference = sorted[Math.floor(sorted.length / 2)];
      // Avoid comparing the month with itself.
      if (reference.month === target.month) {
        reference = sorted.find((b) => b.month !== target.month) ?? reference;
      }
    }

    const deltaEur = target.totalBillEur - reference.totalBillEur;

    // Driver decomposition. totalBill = energyCost + baseFee - feedInCredit.
    // Split the energy-cost delta into a grid-import component (the dominant
    // lever) and a residual that also absorbs rounding so the waterfall is exact.
    const energyDelta = target.energyCostEur - reference.energyCostEur;
    const feedInDelta = -(target.feedInCreditEur - reference.feedInCreditEur);
    const baseFeeDelta = target.baseFeeEur - reference.baseFeeEur;

    const importDelta = target.gridImportKwh - reference.gridImportKwh;
    const pvDelta = target.pvProductionKwh - reference.pvProductionKwh;
    const consumptionDelta = target.consumptionKwh - reference.consumptionKwh;

    const round = (n: number) => Math.round(n);
    const kwh = (n: number) =>
      `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))} kWh`;

    type Driver = {
      key: string;
      label: string;
      amountEur: number;
      direction: "increase" | "decrease";
      detail: string;
    };
    // Keep the energy-cost change as one understandable driver ("Energy cost")
    // instead of splitting it into a grid-import part plus a confusing residual.
    // Surface the causal chain in the detail: consumption drives grid import.
    const raw: Driver[] = [
      {
        key: "energy_cost",
        label: "Energy cost",
        amountEur: energyDelta,
        direction: energyDelta >= 0 ? "increase" : "decrease",
        detail: `Consumption ${kwh(consumptionDelta)} → grid import ${kwh(importDelta)}`,
      },
      {
        key: "feed_in",
        label: "Feed-in credit",
        amountEur: feedInDelta,
        direction: feedInDelta >= 0 ? "increase" : "decrease",
        detail: `PV ${kwh(pvDelta)} → ${eur(Math.abs(feedInDelta))} ${feedInDelta >= 0 ? "less" : "more"} credit`,
      },
      {
        key: "base_fee",
        label: "Base fee",
        amountEur: baseFeeDelta,
        direction: baseFeeDelta >= 0 ? "increase" : "decrease",
        detail:
          baseFeeDelta === 0 ? "unchanged" : `${eur(baseFeeDelta)} difference`,
      },
    ];
    // Drop negligible drivers, sort by impact magnitude.
    const significant = raw
      .filter((d) => Math.abs(d.amountEur) >= 0.5)
      .map((d) => ({ ...d, amountEur: round(d.amountEur) }));

    // Fold any rounding gap into the largest driver so the bars sum to deltaEur.
    const sumSignificant = significant.reduce((s, d) => s + d.amountEur, 0);
    const gap = round(deltaEur) - sumSignificant;
    if (gap !== 0 && significant.length > 0) {
      const top = significant.reduce((a, b) =>
        Math.abs(b.amountEur) > Math.abs(a.amountEur) ? b : a,
      );
      top.amountEur += gap;
    }
    const drivers = significant.sort(
      (a, b) => Math.abs(b.amountEur) - Math.abs(a.amountEur),
    );

    const ctx = (b: (typeof bills)[number]) => ({
      consumptionKwh: round(b.consumptionKwh),
      pvProductionKwh: round(b.pvProductionKwh),
      gridImportKwh: round(b.gridImportKwh),
      gridExportKwh: round(b.gridExportKwh),
      selfSufficiencyPct: round(b.selfSufficiencyPct),
    });

    // Concise plain-language main reason. Consumption is the dominant lever:
    // it drives grid import and therefore most of the bill change.
    const lower = deltaEur < 0;
    const consumptionPct =
      reference.consumptionKwh > 0
        ? Math.abs(consumptionDelta / reference.consumptionKwh) * 100
        : 0;
    const mainReason =
      Math.abs(consumptionDelta) >= 10
        ? `${Math.abs(round(consumptionDelta))} kWh ${consumptionDelta < 0 ? "less" : "more"} consumption (${round(consumptionPct)}%) — ${lower ? "less power drawn from the grid" : "more power drawn from the grid"}.`
        : drivers[0]
          ? `${drivers[0].label}: ${eur(Math.abs(drivers[0].amountEur))} ${drivers[0].amountEur < 0 ? "saved" : "more"}.`
          : "No significant change.";

    // Stacked monthly consumption by area. When the user asks to compare two
    // specific months (both `month` and `compareMonth` given), chart exactly
    // those two months. Otherwise chart the last `months` months ending at the
    // target month. Aggregated in the DB (kW * 0.25 -> kWh per 15-min step).
    const explicitPair = Boolean(
      month && compareMonth && byMonth.has(month) && byMonth.has(compareMonth),
    );
    const targetIdx = bills.findIndex((b) => b.month === target.month);
    const chartMonths = explicitPair
      ? [reference.month, target.month].sort()
      : bills
          .slice(Math.max(0, targetIdx - months + 1), targetIdx + 1)
          .map((b) => b.month);
    const monthStarts = chartMonths.map(
      (m) => new Date(`${m}-01T00:00:00Z`),
    );

    type AreaRow = {
      month: Date;
      house_kwh: number;
      heatpump_kwh: number;
      ev_kwh: number;
    };
    const areaRows = await prisma.$queryRaw<AreaRow[]>`
      SELECT
        date_trunc('month', timestamp) AS month,
        SUM(house_load_kw) * 0.25 AS house_kwh,
        SUM(heatpump_kw) * 0.25 AS heatpump_kwh,
        SUM(ev_charging_kw) * 0.25 AS ev_kwh
      FROM energy_records
      WHERE household_id = ${householdId}
        AND date_trunc('month', timestamp) IN (${Prisma.join(monthStarts)})
      GROUP BY month
      ORDER BY month ASC
    `;
    const monthlyConsumption: MonthlyConsumption[] = areaRows.map((r) => {
      const ym = r.month.toISOString().slice(0, 7);
      const houseKwh = round(Number(r.house_kwh));
      const heatpumpKwh = round(Number(r.heatpump_kwh));
      const evKwh = round(Number(r.ev_kwh));
      return {
        month: ym,
        monthLabel: new Intl.DateTimeFormat("en-GB", {
          timeZone: "UTC",
          month: "short",
          year: "2-digit",
        }).format(r.month),
        houseKwh,
        heatpumpKwh,
        evKwh,
        totalKwh: houseKwh + heatpumpKwh + evKwh,
      };
    });

    const structuredContent = {
      householdId,
      name: household.name,
      month: target.month,
      monthLabel: monthLabelDe(target.month),
      compareMonth: reference.month,
      compareLabel: monthLabelDe(reference.month),
      totalEur: round(target.totalBillEur),
      compareTotalEur: round(reference.totalBillEur),
      deltaEur: round(deltaEur),
      mainReason,
      drivers,
      monthlyConsumption,
      context: { month: ctx(target), compare: ctx(reference) },
    };

    const topDrivers = drivers
      .slice(0, 3)
      .map((d) => `${d.label} ${d.amountEur >= 0 ? "+" : ""}${eur(d.amountEur)}`)
      .join(", ");
    const dir = deltaEur >= 0 ? "higher" : "lower";
    const chartNote =
      monthlyConsumption.length >= 2
        ? ` Consumption by area charted for ${monthlyConsumption.length} months (${monthlyConsumption.map((m) => `${m.monthLabel}: ${m.totalKwh} kWh`).join(", ")}).`
        : "";
    return {
      structuredContent,
      content: `${household.name}: ${monthLabelDe(target.month)} cost ${eur(target.totalBillEur)}, ${eur(Math.abs(deltaEur))} ${dir} than ${monthLabelDe(reference.month)}. Main drivers: ${topDrivers || "no significant change"}.${chartNote}`,
    };
  },
).registerTool(
  {
    name: "best-time-to-run",
    description:
      "Recommends the best time window today or tomorrow to run a flexible load (EV charging, washing machine, dishwasher, heat pump) for one household. Optimizes for lowest effective cost on dynamic tariffs and for maximum PV self-consumption on fixed tariffs. Use for questions like 'when should I charge my car today?' or 'when should I run the washing machine tomorrow?'. Renders a day chart with the recommended window highlighted.",
    inputSchema: {
      household: z
        .enum(HOUSEHOLD_NAMES)
        .default("Familie Becker")
        .describe("Household to plan for, selected by name."),
      appliance: z
        .enum(["ev", "washing-machine", "dishwasher", "heat-pump"])
        .default("ev")
        .describe("The flexible load to schedule."),
      when: z
        .enum(["today", "tomorrow"])
        .default("today")
        .describe(
          "Plan for today or tomorrow. Mapped onto the 2025 dataset (same date one year ago, +1 day for tomorrow).",
        ),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
          "Explicit day as YYYY-MM-DD. Overrides 'when'. Defaults to the mapped today/tomorrow.",
        ),
      durationHours: z
        .number()
        .min(0.5)
        .max(12)
        .optional()
        .describe("Run duration in hours. Defaults to a per-appliance estimate."),
    },
    annotations: { title: "Best time to run", ...readOnly },
    view: {
      component: "best-time-to-run",
      description: "Recommended time window for a flexible load",
    },
  },
  async ({ household: householdName, appliance, when, date, durationHours }) => {
    const household = await prisma.household.findFirstOrThrow({
      where: { name: householdName },
    });
    const householdId = household.householdId;
    const tariffType = household.tariffId === "fixed" ? "fixed" : "dynamic";

    const APPLIANCE_LABELS = {
      ev: "EV charging",
      "washing-machine": "Washing machine",
      dishwasher: "Dishwasher",
      "heat-pump": "Heat pump",
    } as const;
    const DEFAULT_DURATION = {
      ev: 3,
      "washing-machine": 2,
      dishwasher: 2,
      "heat-pump": 1,
    } as const;
    const duration = durationHours ?? DEFAULT_DURATION[appliance];

    // Available data range for this household.
    const range = await prisma.energyRecord.aggregate({
      where: { householdId },
      _min: { timestamp: true },
      _max: { timestamp: true },
    });
    const minTs = range._min.timestamp;
    const maxTs = range._max.timestamp;
    const toDay = (d: Date) => d.toISOString().slice(0, 10);

    // Current German wall-clock date.
    const berlinParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const bPart = (t: string) => berlinParts.find((p) => p.type === t)!.value;
    const berlinYear = Number(bPart("year"));

    // Resolve the target day, mapped onto the 2025 dataset.
    let day = date;
    if (!day) {
      const base = new Date(
        `${berlinYear - 1}-${bPart("month")}-${bPart("day")}T00:00:00Z`,
      );
      if (when === "tomorrow") base.setUTCDate(base.getUTCDate() + 1);
      const mapped = toDay(base);
      const minDay = minTs ? toDay(minTs) : null;
      const maxDay = maxTs ? toDay(maxTs) : null;
      day =
        minDay && mapped < minDay
          ? minDay
          : maxDay && mapped > maxDay
            ? maxDay
            : mapped;
    }

    const from = new Date(`${day}T00:00:00Z`);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);

    const records = await prisma.energyRecord.findMany({
      where: { householdId, timestamp: { gte: from, lt: to } },
      orderBy: { timestamp: "asc" },
    });

    const dateLabel = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(from);

    if (records.length === 0) {
      const empty = {
        householdId,
        name: household.name,
        appliance,
        applianceLabel: APPLIANCE_LABELS[appliance],
        when,
        date: day,
        dateLabel,
        tariffType,
        durationHours: duration,
        window: null,
        effectiveCostEur: null,
        savingsEur: null,
        pvSharePct: null,
        reason: "No energy data available for this day.",
        slots: [] as { clock: string; price: number; pvSurplus: number; inWindow: boolean }[],
      };
      return {
        structuredContent: empty,
        content: `No energy records for ${household.name} on ${day}.`,
      };
    }

    const STEP_HOURS = 0.25;
    // Per-15-min-slot price and PV surplus (kW).
    const slots = records.map((r) => ({
      price: r.priceEurPerKwh,
      pvSurplus: Math.max(r.pvProductionKw - r.totalConsumptionKw, 0),
    }));
    const windowSlots = Math.max(1, Math.round(duration / STEP_HOURS));

    // Assume the appliance draws a flat load over its run. Estimate a plausible
    // per-appliance power so cost/savings are concrete.
    const APPLIANCE_KW = {
      ev: 7.4,
      "washing-machine": 2,
      dishwasher: 1.8,
      "heat-pump": 2.5,
    } as const;
    const loadKw = APPLIANCE_KW[appliance];
    const slotEnergyKwh = loadKw * STEP_HOURS;

    // Score each candidate start slot.
    // dynamic: minimize effective cost (grid price for the share not covered by PV surplus).
    // fixed: maximize PV surplus covered (price is constant, so self-consumption wins).
    let best = { start: 0, score: Infinity, cost: 0, pvCoveredKwh: 0 };
    let worstCost = -Infinity;
    for (let start = 0; start + windowSlots <= slots.length; start++) {
      let cost = 0;
      let pvCoveredKwh = 0;
      for (let i = start; i < start + windowSlots; i++) {
        const pvCoverKw = Math.min(loadKw, slots[i].pvSurplus);
        const gridKw = loadKw - pvCoverKw;
        cost += gridKw * STEP_HOURS * slots[i].price;
        pvCoveredKwh += pvCoverKw * STEP_HOURS;
      }
      worstCost = Math.max(worstCost, cost);
      const score = tariffType === "fixed" ? -pvCoveredKwh : cost;
      if (score < best.score) {
        best = { start, score, cost, pvCoveredKwh };
      }
    }

    const totalEnergyKwh = slotEnergyKwh * windowSlots;
    const pvSharePct =
      totalEnergyKwh > 0 ? (best.pvCoveredKwh / totalEnergyKwh) * 100 : 0;
    const savingsEur = Math.max(worstCost - best.cost, 0);

    const slotClock = (i: number) => {
      const min = i * 15;
      return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    };
    const windowStart = slotClock(best.start);
    const windowEnd = slotClock(best.start + windowSlots);

    const reason =
      tariffType === "fixed"
        ? `Fixed tariff: solar surplus peaks in this window (${Math.round(pvSharePct)}% of the demand covered by your own PV), so you use the most self-generated power.`
        : `Dynamic tariff: cheapest ${duration}-hour window${pvSharePct > 5 ? ` with an additional ${Math.round(pvSharePct)}% PV self-supply` : ""}. Savings vs. the most expensive window: approx. ${savingsEur.toFixed(2)} €.`;

    const round1 = (n: number) => Number(n.toFixed(1));
    const structuredContent = {
      householdId,
      name: household.name,
      appliance,
      applianceLabel: APPLIANCE_LABELS[appliance],
      when,
      date: day,
      dateLabel,
      tariffType,
      durationHours: duration,
      window: { start: windowStart, end: windowEnd, durationHours: duration },
      effectiveCostEur: Number(best.cost.toFixed(2)),
      savingsEur: Number(savingsEur.toFixed(2)),
      pvSharePct: Math.round(pvSharePct),
      reason,
      slots: slots.map((s, i) => ({
        clock: slotClock(i),
        price: Number(s.price.toFixed(4)),
        pvSurplus: round1(s.pvSurplus),
        inWindow: i >= best.start && i < best.start + windowSlots,
      })),
    };

    return {
      structuredContent,
      content: `Best time to run ${APPLIANCE_LABELS[appliance]} for ${household.name} on ${day} (${tariffType} tariff): ${windowStart}–${windowEnd}. Effective cost ~${best.cost.toFixed(2)} €, PV share ${Math.round(pvSharePct)}%, savings vs. worst window ~${savingsEur.toFixed(2)} €.`,
    };
  },
);

export default await server.run();

export type AppType = typeof server;
