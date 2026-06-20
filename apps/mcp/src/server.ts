import { McpServer } from "skybridge/server";
import { z } from "zod";
import { prisma } from "./db.js";
import type {
  Household,
  MonthlyBill,
  InsightEvent,
  DynamicPrice,
  Tariff,
} from "@enpal/db";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const server = new McpServer(
  { name: "enpal-energy-companion", version: "0.0.1" },
  { capabilities: {} },
)
  .registerTool(
    {
      name: "list-households",
      description:
        "List the available Enpal households with their assets and tariff. Use this to let the user pick a household before drilling into its data.",
      annotations: { title: "List households", ...readOnly },
      view: { component: "list-households", description: "Household picker" },
    },
    async () => {
      const households: (Household & { tariff: Tariff })[] =
        await prisma.household.findMany({
          orderBy: { householdId: "asc" },
          include: { tariff: true },
        });
      const structuredContent = {
        households: households.map((h) => ({
          id: h.householdId,
          name: h.name,
          city: h.city,
          residents: h.residents,
          pvKwp: h.pvKwp,
          batteryKwh: h.batteryKwh,
          heatPump: h.heatPump,
          evCharger: h.evCharger,
          tariff: h.tariff.name,
        })),
      };
      return {
        structuredContent,
        content: structuredContent.households
          .map((h) => `${h.id} — ${h.name} (${h.city}), tariff ${h.tariff}`)
          .join("\n"),
      };
    },
  )
  .registerTool(
    {
      name: "household-overview",
      description:
        "Annual 2025 energy summary for one household: total bill, average self-sufficiency, PV production, and asset configuration.",
      inputSchema: {
        householdId: z.string().describe("Household id, e.g. HH-1001"),
      },
      annotations: { title: "Household overview", ...readOnly },
      view: { component: "household-overview", description: "Annual summary" },
    },
    async ({ householdId }) => {
      const household: Household & {
        tariff: Tariff;
        monthlyBills: MonthlyBill[];
      } = await prisma.household.findUniqueOrThrow({
        where: { householdId },
        include: { tariff: true, contract: true, monthlyBills: true },
      });
      const bills: MonthlyBill[] = household.monthlyBills;
      const totalBill = bills.reduce((s, b) => s + b.totalBillEur, 0);
      const pv = bills.reduce((s, b) => s + b.pvProductionKwh, 0);
      const consumption = bills.reduce((s, b) => s + b.consumptionKwh, 0);
      const avgSelfSufficiency = bills.length
        ? bills.reduce((s, b) => s + b.selfSufficiencyPct, 0) / bills.length
        : 0;

      const structuredContent = {
        id: household.householdId,
        name: household.name,
        city: household.city,
        residents: household.residents,
        tariff: household.tariff.name,
        assets: {
          pvKwp: household.pvKwp,
          batteryKwh: household.batteryKwh,
          heatPump: household.heatPump,
          evCharger: household.evCharger,
        },
        year2025: {
          totalBillEur: Math.round(totalBill),
          pvProductionKwh: Math.round(pv),
          consumptionKwh: Math.round(consumption),
          avgSelfSufficiencyPct: Math.round(avgSelfSufficiency),
        },
      };
      return {
        structuredContent,
        content: `${household.name} (${household.city}) paid ~EUR ${Math.round(totalBill)} in 2025 with ${Math.round(avgSelfSufficiency)}% average self-sufficiency.`,
      };
    },
  )
  .registerTool(
    {
      name: "monthly-bills",
      description:
        "Monthly bills and self-sufficiency for one household across 2025.",
      inputSchema: { householdId: z.string() },
      annotations: { title: "Monthly bills", ...readOnly },
      view: { component: "monthly-bills", description: "Monthly bill trend" },
    },
    async ({ householdId }) => {
      const bills: MonthlyBill[] = await prisma.monthlyBill.findMany({
        where: { householdId },
        orderBy: { month: "asc" },
      });
      const structuredContent = {
        householdId,
        months: bills.map((b) => ({
          month: b.month,
          totalBillEur: Math.round(b.totalBillEur),
          consumptionKwh: Math.round(b.consumptionKwh),
          pvProductionKwh: Math.round(b.pvProductionKwh),
          selfSufficiencyPct: Math.round(b.selfSufficiencyPct),
        })),
      };
      return {
        structuredContent,
        content: `${bills.length} monthly bills for ${householdId}.`,
      };
    },
  )
  .registerTool(
    {
      name: "energy-balance",
      description:
        "Daily energy balance (PV, consumption, grid import/export, kWh) for one household in a given month of 2025.",
      inputSchema: {
        householdId: z.string(),
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .describe("Month as YYYY-MM, e.g. 2025-07"),
      },
      annotations: { title: "Energy balance", ...readOnly },
      view: { component: "energy-balance", description: "Daily energy balance" },
    },
    async ({ householdId, month }) => {
      const from = new Date(`${month}-01T00:00:00Z`);
      const to = new Date(from);
      to.setUTCMonth(to.getUTCMonth() + 1);

      type DailyRow = {
        day: Date;
        pv_kwh: number;
        consumption_kwh: number;
        grid_import_kwh: number;
        grid_export_kwh: number;
      };
      const rows: DailyRow[] = await prisma.$queryRaw<DailyRow[]>`
        SELECT
          date_trunc('day', timestamp) AS day,
          SUM(pv_production_kw) * 0.25 AS pv_kwh,
          SUM(total_consumption_kw) * 0.25 AS consumption_kwh,
          SUM(grid_import_kw) * 0.25 AS grid_import_kwh,
          SUM(grid_export_kw) * 0.25 AS grid_export_kwh
        FROM energy_records
        WHERE household_id = ${householdId}
          AND timestamp >= ${from}
          AND timestamp < ${to}
        GROUP BY day
        ORDER BY day ASC
      `;
      const days = rows.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        pvKwh: Math.round(Number(r.pv_kwh)),
        consumptionKwh: Math.round(Number(r.consumption_kwh)),
        gridImportKwh: Math.round(Number(r.grid_import_kwh)),
        gridExportKwh: Math.round(Number(r.grid_export_kwh)),
      }));
      return {
        structuredContent: { householdId, month, days },
        content: `Daily energy balance for ${householdId} in ${month} (${days.length} days).`,
      };
    },
  )
  .registerTool(
    {
      name: "insights",
      description:
        "Pre-detected anomalies, nudges and insights (e.g. heat-pump fault, cheapest charging window, bill spikes) for one household.",
      inputSchema: { householdId: z.string() },
      annotations: { title: "Insights & nudges", ...readOnly },
      view: { component: "insights", description: "Insights feed" },
    },
    async ({ householdId }) => {
      const events: InsightEvent[] = await prisma.insightEvent.findMany({
        where: { householdId },
        orderBy: { id: "asc" },
      });
      return {
        structuredContent: {
          householdId,
          events: events.map((e) => ({
            type: e.type,
            severity: e.severity,
            period: e.period,
            title: e.title,
            detail: e.detail,
            suggestedAction: e.suggestedAction,
          })),
        },
        content: events.map((e) => `[${e.type}] ${e.title}`).join("\n"),
      };
    },
  )
  .registerTool(
    {
      name: "explain-contract",
      description:
        "Return the contract terms (start/end, minimum term, notice period, pricing, feed-in) and full legal text for a household. Use to answer contract/tariff questions.",
      inputSchema: { householdId: z.string() },
      annotations: { title: "Explain contract", ...readOnly },
    },
    async ({ householdId }) => {
      const c = await prisma.contract.findUniqueOrThrow({
        where: { householdId },
      });
      const structuredContent = {
        householdId,
        provider: c.provider,
        tariff: c.tariffName,
        contractStart: c.contractStart,
        contractEnd: c.contractEnd,
        minimumTermMonths: c.minimumTermMonths,
        noticePeriodWeeks: c.noticePeriodWeeks,
        autoRenewMonths: c.autoRenewMonths,
        baseFeeEurPerMonth: c.baseFeeEur,
        pricingModel: c.pricingModel,
        feedInEurPerKwh: c.feedInEur,
      };
      return {
        structuredContent,
        content: c.contractTermsText,
      };
    },
  )
  .registerTool(
    {
      name: "cheapest-window",
      description:
        "Find the cheapest dynamic electricity hours in a date range. Returns the lowest-price hours (retail = spot + tariff adder of 0.119 EUR/kWh for dynamic tariffs). Use for charging/appliance nudges.",
      inputSchema: {
        from: z.string().describe("Start date YYYY-MM-DD (inclusive)"),
        to: z.string().describe("End date YYYY-MM-DD (exclusive)"),
        limit: z.number().int().min(1).max(24).optional(),
      },
      annotations: { title: "Cheapest price window", ...readOnly },
    },
    async ({ from, to, limit }) => {
      const adder = 0.119;
      const prices: DynamicPrice[] = await prisma.dynamicPrice.findMany({
        where: {
          timestamp: {
            gte: new Date(`${from}T00:00:00Z`),
            lt: new Date(`${to}T00:00:00Z`),
          },
        },
        orderBy: { spotPriceEurPerKwh: "asc" },
        take: limit ?? 5,
      });
      const cheapest = prices.map((p) => ({
        timestamp: p.timestamp.toISOString(),
        spotEurPerKwh: Number(p.spotPriceEurPerKwh.toFixed(4)),
        retailEurPerKwh: Number((p.spotPriceEurPerKwh + adder).toFixed(4)),
      }));
      return {
        structuredContent: { from, to, cheapest },
        content: cheapest
          .map(
            (c) =>
              `${c.timestamp}: ${c.retailEurPerKwh} EUR/kWh retail (spot ${c.spotEurPerKwh})`,
          )
          .join("\n"),
      };
    },
  );

export default await server.run();

export type AppType = typeof server;
