import { McpServer } from "skybridge/server";
import { z } from "zod";
import { prisma } from "./db.js";
import { getNow, dayString, addDays } from "./now.js";
import type {
  Household,
  MonthlyBill,
  InsightEvent,
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
      name: "bill-breakdown",
      description:
        "Explain WHY a household's bill changed vs the previous month. Splits the difference into a volume effect (more/less kWh) and a price effect (cheaper/more expensive electricity), per consumer (heat pump, EV, house load), plus PV and feed-in changes. Use to answer 'why was my bill higher this month?'.",
      inputSchema: {
        householdId: z.string().describe("Household id, e.g. HH-1001"),
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .describe("Target month as YYYY-MM, e.g. 2025-12"),
      },
      annotations: { title: "Bill breakdown", ...readOnly },
    },
    async ({ householdId, month }) => {
      const household: Household & { tariff: Tariff } =
        await prisma.household.findUniqueOrThrow({
          where: { householdId },
          include: { tariff: true },
        });
      const feedIn = household.tariff.feedInEur;

      const curStart = new Date(`${month}-01T00:00:00Z`);
      const prevStart = new Date(curStart);
      prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
      const curEnd = new Date(curStart);
      curEnd.setUTCMonth(curEnd.getUTCMonth() + 1);

      type MonthRow = {
        month: Date;
        heatpump_kwh: number;
        ev_kwh: number;
        house_kwh: number;
        heatpump_cost_eur: number;
        ev_cost_eur: number;
        house_cost_eur: number;
        pv_kwh: number;
        consumption_kwh: number;
        grid_import_kwh: number;
        grid_export_kwh: number;
        grid_cost_eur: number;
      };
      const rows: MonthRow[] = await prisma.$queryRaw<MonthRow[]>`
        SELECT
          date_trunc('month', timestamp) AS month,
          SUM(heatpump_kw)        * 0.25 AS heatpump_kwh,
          SUM(ev_charging_kw)     * 0.25 AS ev_kwh,
          SUM(house_load_kw)      * 0.25 AS house_kwh,
          -- exact slot-level cost: each consumer's kWh valued at its own slot price
          SUM(heatpump_kw   * 0.25 * price_eur_per_kwh) AS heatpump_cost_eur,
          SUM(ev_charging_kw * 0.25 * price_eur_per_kwh) AS ev_cost_eur,
          SUM(house_load_kw  * 0.25 * price_eur_per_kwh) AS house_cost_eur,
          SUM(pv_production_kw)   * 0.25 AS pv_kwh,
          SUM(total_consumption_kw) * 0.25 AS consumption_kwh,
          SUM(grid_import_kw)     * 0.25 AS grid_import_kwh,
          SUM(grid_export_kw)     * 0.25 AS grid_export_kwh,
          SUM(grid_import_kw * 0.25 * price_eur_per_kwh) AS grid_cost_eur
        FROM energy_records
        WHERE household_id = ${householdId}
          AND timestamp >= ${prevStart}
          AND timestamp < ${curEnd}
        GROUP BY month
        ORDER BY month ASC
      `;

      const pick = (start: Date) =>
        rows.find((r) => r.month.getUTCMonth() === start.getUTCMonth());
      const prev = pick(prevStart);
      const cur = pick(curStart);
      if (!cur) {
        const empty = `No energy data for ${householdId} in ${month}.`;
        return { structuredContent: { householdId, month, error: empty }, content: empty };
      }

      const n = (v: number | undefined) => Number(v ?? 0);
      const r2 = (v: number) => Math.round(v * 100) / 100;

      // Weighted average grid import price (EUR/kWh) per month.
      const curImport = n(cur.grid_import_kwh);
      const prevImport = n(prev?.grid_import_kwh);
      const curPrice = curImport > 0 ? n(cur.grid_cost_eur) / curImport : 0;
      const prevPrice = prevImport > 0 ? n(prev?.grid_cost_eur) / prevImport : 0;

      // Price/volume variance decomposition on grid import cost.
      const volumeEffect = (curImport - prevImport) * prevPrice;
      const priceEffect = (curPrice - prevPrice) * prevImport;
      const interaction =
        (curImport - prevImport) * (curPrice - prevPrice);
      const gridCostDelta = n(cur.grid_cost_eur) - n(prev?.grid_cost_eur);

      // Feed-in credit change (more export = more revenue = lower bill).
      const curCredit = n(cur.grid_export_kwh) * feedIn;
      const prevCredit = n(prev?.grid_export_kwh) * feedIn;
      const feedInEffect = -(curCredit - prevCredit); // bill impact

      const consumers = [
        {
          key: "heatpump",
          cur: n(cur.heatpump_kwh),
          prev: n(prev?.heatpump_kwh),
          curCost: n(cur.heatpump_cost_eur),
          prevCost: n(prev?.heatpump_cost_eur),
        },
        {
          key: "ev",
          cur: n(cur.ev_kwh),
          prev: n(prev?.ev_kwh),
          curCost: n(cur.ev_cost_eur),
          prevCost: n(prev?.ev_cost_eur),
        },
        {
          key: "house",
          cur: n(cur.house_kwh),
          prev: n(prev?.house_kwh),
          curCost: n(cur.house_cost_eur),
          prevCost: n(prev?.house_cost_eur),
        },
      ].map((c) => ({
        consumer: c.key,
        kwh: r2(c.cur),
        prevKwh: r2(c.prev),
        deltaKwh: r2(c.cur - c.prev),
        // exact: this consumer's kWh valued at its own 15-min slot price
        costEur: r2(c.curCost),
        prevCostEur: r2(c.prevCost),
        deltaCostEur: r2(c.curCost - c.prevCost),
      }));

      const totalBillDelta = gridCostDelta + feedInEffect;
      const driver =
        Math.abs(priceEffect) > Math.abs(volumeEffect)
          ? `mainly higher electricity price (${r2(prevPrice)}→${r2(curPrice)} EUR/kWh)`
          : `mainly higher consumption (+${r2(curImport - prevImport)} kWh from grid)`;

      const structuredContent = {
        householdId,
        month,
        prevMonth: dayString(prevStart).slice(0, 7),
        costNote:
          "Per-consumer costEur is EXACT: each consumer's kWh is valued at its own 15-min slot price. Caveat: it values gross consumption at the slot price and does NOT subtract PV/battery self-coverage, so per-consumer costs sum to gross consumption value, not the net grid bill. The net bill = grid-import cost (+ base fee - feed-in), split exactly by volume/price effect below.",
        consumers,
        pvKwh: r2(n(cur.pv_kwh)),
        prevPvKwh: r2(n(prev?.pv_kwh)),
        gridImportKwh: r2(curImport),
        prevGridImportKwh: r2(prevImport),
        avgImportPriceEurPerKwh: r2(curPrice),
        prevAvgImportPriceEurPerKwh: r2(prevPrice),
        decomposition: {
          volumeEffectEur: r2(volumeEffect),
          priceEffectEur: r2(priceEffect),
          interactionEur: r2(interaction),
          gridCostDeltaEur: r2(gridCostDelta),
          feedInEffectEur: r2(feedInEffect),
          totalBillDeltaEur: r2(totalBillDelta),
        },
        summary: `Bill changed by ~EUR ${r2(totalBillDelta)} vs ${dayString(prevStart).slice(0, 7)}, ${driver}.`,
      };
      return {
        structuredContent,
        content: structuredContent.summary,
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
      name: "charge-advisor",
      description:
        "Decide WHEN to charge the EV, preferring PV surplus (almost free) over cheap grid hours. mode 'now' answers 'should I charge right now?' using the actual current slot at NOW. mode 'plan' answers 'when should I charge today/tomorrow?' by ESTIMATING the day's PV and price curve from comparable historical days (never peeking future actuals). Use for any EV charging timing question.",
      inputSchema: {
        householdId: z.string().describe("Household id, e.g. HH-1001"),
        mode: z
          .enum(["now", "plan"])
          .default("plan")
          .describe("'now' = charge right now? | 'plan' = best windows for a day"),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}$|^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            "For mode 'plan': day to plan as YYYY-MM-DD. Default = tomorrow (NOW+1). Past/today use history; future is estimated.",
          ),
        targetKwh: z
          .number()
          .min(1)
          .max(80)
          .optional()
          .describe("How much to charge (kWh). Default 11."),
      },
      annotations: { title: "EV charge advisor", ...readOnly },
    },
    async ({ householdId, mode, date, targetKwh }) => {
      const now = await getNow();
      const household: Household & { tariff: Tariff } =
        await prisma.household.findUniqueOrThrow({
          where: { householdId },
          include: { tariff: true },
        });
      const feedIn = household.tariff.feedInEur; // opportunity cost of self-using PV
      const target = targetKwh ?? 11;

      // Effective EUR/kWh of a slot: PV surplus costs only the lost feed-in
      // revenue; otherwise you pay the grid price.
      const slotCost = (surplusKw: number, price: number) =>
        surplusKw > 0.1 ? feedIn : price;

      if (mode === "now") {
        const rec = await prisma.energyRecord.findFirst({
          where: { householdId, timestamp: { lte: now } },
          orderBy: { timestamp: "desc" },
        });
        if (!rec) {
          const msg = `No data at or before NOW for ${householdId}.`;
          return { structuredContent: { error: msg }, content: msg };
        }
        const surplus =
          rec.pvProductionKw - rec.houseLoadKw - rec.heatpumpKw;
        const onPv = surplus > 0.1;
        const cheapGrid = rec.priceEurPerKwh <= 0.2;
        const decision = onPv || cheapGrid ? "yes" : "wait";
        const reason = onPv
          ? `PV surplus ~${Math.round(surplus * 100) / 100} kW available — charge on solar (near free).`
          : cheapGrid
            ? `No PV surplus, but grid is cheap (${rec.priceEurPerKwh.toFixed(3)} EUR/kWh).`
            : `No PV surplus and grid is pricey (${rec.priceEurPerKwh.toFixed(3)} EUR/kWh), battery ${Math.round(rec.batterySocPct)}%. Better to wait.`;
        const structuredContent = {
          mode,
          householdId,
          at: rec.timestamp.toISOString(),
          forecastSource: "actual" as const,
          decision,
          pvSurplusKw: Math.round(surplus * 100) / 100,
          priceEurPerKwh: Number(rec.priceEurPerKwh.toFixed(4)),
          batterySocPct: Math.round(rec.batterySocPct),
          reason,
        };
        return { structuredContent, content: `${decision.toUpperCase()} — ${reason}` };
      }

      // mode === "plan": forecast the chosen day from comparable history.
      const planDay = date
        ? new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00Z`)
        : addDays(now, 1);
      const planDayStr = dayString(planDay);
      const hasActuals = planDay <= now; // day is in the past relative to NOW

      // Window: a past day uses its own actual records; a future day is
      // estimated from the 14 comparable days strictly before NOW.
      const winStart = hasActuals ? planDay : addDays(now, -14);
      const winEnd = hasActuals ? addDays(planDay, 1) : now;
      type SlotRow = {
        slot: string;
        pv: number;
        base_load: number;
        price: number;
      };
      const slots: SlotRow[] = await prisma.$queryRaw<SlotRow[]>`
        SELECT
          to_char(timestamp, 'HH24:MI') AS slot,
          AVG(pv_production_kw) AS pv,
          AVG(house_load_kw + heatpump_kw) AS base_load,
          AVG(price_eur_per_kwh) AS price
        FROM energy_records
        WHERE household_id = ${householdId}
          AND timestamp >= ${winStart}
          AND timestamp <= ${winEnd}
        GROUP BY slot
        ORDER BY slot ASC
      `;

      const ranked = slots
        .map((s) => {
          const surplus = Number(s.pv) - Number(s.base_load);
          const cost = slotCost(surplus, Number(s.price));
          return {
            slot: s.slot,
            pvSurplusKw: Math.round(surplus * 100) / 100,
            gridPriceEurPerKwh: Number(Number(s.price).toFixed(4)),
            effectiveCostEurPerKwh: Number(cost.toFixed(4)),
            source: surplus > 0.1 ? ("pv-surplus" as const) : ("grid" as const),
          };
        })
        .sort((a, b) => a.effectiveCostEurPerKwh - b.effectiveCostEurPerKwh);

      // Greedily fill targetKwh from the cheapest slots (each slot ~ surplus or
      // a nominal 11 kW charge capacity over 15 min = 2.75 kWh).
      const recommended: typeof ranked = [];
      let kwh = 0;
      for (const s of ranked) {
        if (kwh >= target) break;
        const slotKwh =
          s.source === "pv-surplus"
            ? Math.max(s.pvSurplusKw * 0.25, 0)
            : 2.75;
        if (slotKwh <= 0) continue;
        recommended.push(s);
        kwh += slotKwh;
      }
      recommended.sort((a, b) => a.slot.localeCompare(b.slot));

      // Group contiguous recommended 15-min slots (same source) into windows.
      const toMin = (hhmm: string) =>
        Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
      const fmt = (min: number) =>
        `${String(Math.floor((min % 1440) / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
      type Win = {
        from: string;
        to: string;
        source: "pv-surplus" | "grid";
        avgCostEurPerKwh: number;
        costs: number[];
      };
      const windows: Win[] = [];
      for (const s of recommended) {
        const last = windows[windows.length - 1];
        const startMin = toMin(s.slot);
        if (
          last &&
          last.source === s.source &&
          toMin(last.to) === startMin // previous window ends exactly where this slot starts
        ) {
          last.to = fmt(startMin + 15);
          last.costs.push(s.effectiveCostEurPerKwh);
        } else {
          windows.push({
            from: s.slot,
            to: fmt(startMin + 15),
            source: s.source,
            avgCostEurPerKwh: 0,
            costs: [s.effectiveCostEurPerKwh],
          });
        }
      }
      const cleanWindows = windows
        .map((w) => ({
          from: w.from,
          to: w.to,
          source: w.source,
          avgCostEurPerKwh: Number(
            (w.costs.reduce((a, b) => a + b, 0) / w.costs.length).toFixed(4),
          ),
        }))
        .sort((a, b) => a.avgCostEurPerKwh - b.avgCostEurPerKwh);

      const best = cleanWindows[0];
      const windowPhrase = (w: { from: string; to: string; source: string; avgCostEurPerKwh: number }) =>
        `${w.from}\u2013${w.to} (${w.source === "pv-surplus" ? "PV surplus" : "cheap grid"}, ~EUR ${w.avgCostEurPerKwh}/kWh)`;
      const summary = best
        ? `Charge on ${planDayStr} best at ${windowPhrase(best)}${
            cleanWindows[1] ? `, then ${windowPhrase(cleanWindows[1])}` : ""
          }.`
        : `No charging windows estimated for ${planDayStr}.`;

      const structuredContent = {
        mode,
        householdId,
        date: planDayStr,
        forecastSource: hasActuals
          ? ("actual" as const)
          : ("estimated" as const),
        disclaimer: hasActuals
          ? "Day is in the past; profile from its own records."
          : "Estimated from the 14 comparable days before NOW — not a real weather/price forecast.",
        targetKwh: target,
        bestWindow: best ?? null,
        windows: cleanWindows,
        recommended,
        summary,
      };
       return { structuredContent, content: summary };
    },
  )
  .registerTool(
    {
      name: "optimize",
      description:
        "Answer 'how could I optimize my charging/usage?' AND 'should I switch to the fixed/dynamic tariff?' for one household. Compares the WHOLE-HOUSE bill under both tariffs (fixed flat rate vs dynamic spot+adder) at the household's actual usage, and — for EV households — quantifies how much smarter charging (shifting EV load to PV-surplus and the cheapest spot hours) would save under a dynamic tariff. Gives a flexibility-aware verdict (which tariff wins now vs with smart charging). NOW-safe: never reads future data.",
      inputSchema: {
        householdId: z.string().describe("Household id, e.g. HH-1001"),
        period: z
          .string()
          .regex(/^\d{4}$|^\d{4}-\d{2}$/)
          .optional()
          .describe(
            "Analysis window as YYYY or YYYY-MM. Default = full year of NOW. Clipped to NOW (no future data).",
          ),
      },
      annotations: { title: "Optimize & tariff advisor", ...readOnly },
    },
    async ({ householdId, period }) => {
      const now = await getNow();
      const household: Household & { tariff: Tariff } =
        await prisma.household.findUniqueOrThrow({
          where: { householdId },
          include: { tariff: true },
        });

      // Tariff parameters come from the DB (Tariff table), NOT hardcoded, so
      // this generalizes to any fixed/dynamic tariffs and any price changes.
      const allTariffs: Tariff[] = await prisma.tariff.findMany();
      const current = household.tariff;
      // The "variable" tariff is whichever charges a spot adder; smart charging
      // only pays off under such a tariff.
      const dynamicTariff = allTariffs.find((t) => t.spotAdderEur != null);
      const dynAdder = dynamicTariff?.spotAdderEur ?? 0;
      const dynFeedIn = dynamicTariff?.feedInEur ?? current.feedInEur;

      // Period window, clipped to NOW so we never read the future.
      const yr = period?.slice(0, 4) ?? String(now.getUTCFullYear());
      const from = period?.length === 7
        ? new Date(`${period}-01T00:00:00Z`)
        : new Date(`${yr}-01-01T00:00:00Z`);
      const rawTo = period?.length === 7
        ? new Date(new Date(`${period}-01T00:00:00Z`).setUTCMonth(from.getUTCMonth() + 1))
        : new Date(`${Number(yr) + 1}-01-01T00:00:00Z`);
      const to = rawTo > now ? now : rawTo;

      const r2 = (v: number) => Math.round(v * 100) / 100;

      // --- Whole-house tariff counterfactual (independent of actual tariff) ---
      // We pull the raw spot-priced import cost; each tariff's retail cost is
      // then derived from its own DB params.
      type TotRow = {
        months: number;
        grid_import_kwh: number;
        grid_export_kwh: number;
        spot_import_cost_eur: number;
      };
      const [tot] = await prisma.$queryRaw<TotRow[]>`
        SELECT
          COUNT(DISTINCT date_trunc('month', er.timestamp)) AS months,
          SUM(er.grid_import_kw) * 0.25 AS grid_import_kwh,
          SUM(er.grid_export_kw) * 0.25 AS grid_export_kwh,
          SUM(er.grid_import_kw * 0.25 * dp.spot_price_eur_per_kwh) AS spot_import_cost_eur
        FROM energy_records er
        JOIN dynamic_prices dp ON dp.timestamp = date_trunc('hour', er.timestamp)
        WHERE er.household_id = ${householdId}
          AND er.timestamp >= ${from}
          AND er.timestamp < ${to}
      `;
      if (!tot || !tot.grid_import_kwh) {
        const msg = `No energy data for ${householdId} in ${yr}.`;
        return { structuredContent: { householdId, error: msg }, content: msg };
      }
      const months = Math.max(Number(tot.months), 1);
      const gridImport = Number(tot.grid_import_kwh);
      const gridExport = Number(tot.grid_export_kwh);
      const spotImportCost = Number(tot.spot_import_cost_eur);

      // Annual cost for THIS household's usage under any given tariff, derived
      // purely from that tariff's DB params (energy rate / spot adder / base /
      // feed-in). Returns null for unknown pricing models.
      const totalFor = (t: Tariff): number | null => {
        const base = t.baseFeeEur * months;
        const credit = gridExport * t.feedInEur;
        if (t.energyRateEur != null)
          return gridImport * t.energyRateEur + base - credit; // flat rate
        if (t.spotAdderEur != null)
          return spotImportCost + t.spotAdderEur * gridImport + base - credit; // spot + adder
        return null;
      };

      type Opt = { tariffId: string; name: string; type: string; totalEur: number };
      const options: Opt[] = allTariffs
        .map((t) => ({
          tariffId: t.tariffId,
          name: t.name,
          type: t.type,
          totalEur: totalFor(t),
        }))
        .filter((o): o is Opt => o.totalEur != null)
        .map((o) => ({ ...o, totalEur: r2(o.totalEur) }))
        .sort((a, b) => a.totalEur - b.totalEur);
      const currentTotal = r2(totalFor(current) ?? 0);
      const cheapestNow = options[0];
      const deltaNow = Math.abs(currentTotal - cheapestNow.totalEur);

      // --- EV charging behaviour & smart-charging potential (dynamic prices) ---
      let charging:
        | {
            evKwh: number;
            evWeightedAvgPriceEur: number;
            pvCoincidenceKwh: number;
            pvCoincidencePct: number;
            evKwhInExpensiveDynamicHours: number;
            smartChargingSavingsEurUnderDynamic: number;
          }
        | undefined;

      if (household.evCharger) {
        type HourRow = {
          day: Date;
          hour: number;
          ev_kwh: number;
          pv_surplus_kwh: number;
          actual_price: number;
          spot: number;
        };
        const hours = await prisma.$queryRaw<HourRow[]>`
          SELECT
            date_trunc('day', er.timestamp) AS day,
            EXTRACT(HOUR FROM er.timestamp)::int AS hour,
            SUM(er.ev_charging_kw) * 0.25 AS ev_kwh,
            SUM(GREATEST(er.pv_production_kw - er.house_load_kw - er.heatpump_kw, 0)) * 0.25 AS pv_surplus_kwh,
            AVG(er.price_eur_per_kwh) AS actual_price,
            MAX(dp.spot_price_eur_per_kwh) AS spot
          FROM energy_records er
          JOIN dynamic_prices dp ON dp.timestamp = date_trunc('hour', er.timestamp)
          WHERE er.household_id = ${householdId}
            AND er.timestamp >= ${from}
            AND er.timestamp < ${to}
          GROUP BY day, hour
          ORDER BY day, hour
        `;

        // Effective EUR/kWh of an hour: PV surplus is valued at the lost
        // feed-in revenue (near-free), otherwise the dynamic retail price.
        const EV_HOUR_CAP = 11; // nominal 11 kW charger => 11 kWh/h
        const byDay = new Map<string, HourRow[]>();
        for (const h of hours) {
          const k = h.day.toISOString().slice(0, 10);
          (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(h);
        }

        let evKwh = 0;
        let evWeightedPriceNum = 0;
        let pvCoincidence = 0;
        let expensiveKwh = 0;
        let actualDynCost = 0;
        let optimalDynCost = 0;

        for (const dayHours of byDay.values()) {
          const evDay = dayHours.reduce((s, h) => s + Number(h.ev_kwh), 0);
          const dynRetail = dayHours.map((h) => Number(h.spot) + dynAdder);
          const median = [...dynRetail].sort((a, b) => a - b)[
            Math.floor(dynRetail.length / 2)
          ];
          const eff = dayHours.map((h, i) =>
            Number(h.pv_surplus_kwh) > 0.2 ? dynFeedIn : dynRetail[i],
          );

          dayHours.forEach((h, i) => {
            const ev = Number(h.ev_kwh);
            evKwh += ev;
            evWeightedPriceNum += ev * Number(h.actual_price);
            if (Number(h.pv_surplus_kwh) > 0.2) pvCoincidence += ev;
            if (dynRetail[i] > median) expensiveKwh += ev;
            actualDynCost += ev * eff[i]; // EV at its real timing, dynamic price
          });

          // Optimal: re-place the day's EV kWh into the cheapest hours first.
          const order = dayHours
            .map((_, i) => i)
            .sort((a, b) => eff[a] - eff[b]);
          let remaining = evDay;
          for (const i of order) {
            if (remaining <= 0) break;
            const put = Math.min(remaining, EV_HOUR_CAP);
            optimalDynCost += put * eff[i];
            remaining -= put;
          }
        }

        const smartSavings = Math.max(actualDynCost - optimalDynCost, 0);
        charging = {
          evKwh: r2(evKwh),
          evWeightedAvgPriceEur:
            evKwh > 0 ? Number((evWeightedPriceNum / evKwh).toFixed(4)) : 0,
          pvCoincidenceKwh: r2(pvCoincidence),
          pvCoincidencePct: evKwh > 0 ? Math.round((pvCoincidence / evKwh) * 100) : 0,
          evKwhInExpensiveDynamicHours: r2(expensiveKwh),
          smartChargingSavingsEurUnderDynamic: r2(smartSavings),
        };
      }

      // --- Flexibility-aware verdict -----------------------------------------
      // Smart charging only lowers the variable (spot) tariff; flat tariffs are
      // timing-invariant. Recompute the ranking with that discount applied.
      const smart = charging?.smartChargingSavingsEurUnderDynamic ?? 0;
      const optionsSmart: Opt[] = options
        .map((o) =>
          o.tariffId === dynamicTariff?.tariffId
            ? { ...o, totalEur: r2(o.totalEur - smart) }
            : o,
        )
        .sort((a, b) => a.totalEur - b.totalEur);
      const cheapestSmart = optionsSmart[0];
      const dynSmartTotal =
        optionsSmart.find((o) => o.tariffId === dynamicTariff?.tariffId)?.totalEur ??
        null;
      const deltaSmart = Math.abs(currentTotal - cheapestSmart.totalEur);

      const switchNow = cheapestNow.tariffId !== current.tariffId;
      const switchSmart = cheapestSmart.tariffId !== current.tariffId;
      const flips =
        !!charging && smart > 0 && cheapestNow.tariffId !== cheapestSmart.tariffId;

      const recommendation = !household.evCharger
        ? switchNow
          ? `Consider switching to ${cheapestNow.name} (~EUR ${r2(deltaNow)} cheaper/period).`
          : `Stay on ${current.name}.`
        : switchSmart
          ? `Switch to ${cheapestSmart.name} and adopt smart charging.`
          : `Stay on ${current.name}.`;

      const note = !household.evCharger
        ? `No EV: the main flexible loads (heat pump, battery) are auto-dispatched, so tariff choice mostly tracks total usage. ${cheapestNow.name} is the cheaper fit here.`
        : flips
          ? `At your CURRENT charging, ${cheapestNow.name} is cheaper by ~EUR ${r2(deltaNow)}. But shifting the EV into PV-surplus/cheap spot hours saves ~EUR ${r2(smart)} on ${dynamicTariff?.name}, which makes it the cheapest option.`
          : smart > 0
            ? `Smart charging would save ~EUR ${r2(smart)} on ${dynamicTariff?.name}, but it doesn't change which tariff wins (${cheapestSmart.name}).`
            : `Charging timing barely moves the result here; ${cheapestNow.name} stays cheapest.`;

      const summary = `${householdId} (${yr}): cheapest tariff at current usage is ${cheapestNow.name} (~EUR ${cheapestNow.totalEur}, current ${current.name} ~EUR ${currentTotal}). ${recommendation}`;

      const structuredContent = {
        householdId,
        period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), months },
        currentTariffId: current.tariffId,
        currentTariff: current.name,
        currentTotalEur: currentTotal,
        hasEv: household.evCharger,
        gridImportKwh: r2(gridImport),
        gridExportKwh: r2(gridExport),
        tariffComparison: {
          options, // every tariff in the DB, costed for this household's usage
          cheapestAtCurrentBehavior: cheapestNow.tariffId,
          deltaEur: r2(deltaNow),
          assumes:
            "Same physical usage; each tariff's rate/adder/base/feed-in read live from the Tariff table.",
        },
        charging,
        verdict: {
          withSmartCharging: {
            dynamicTariffId: dynamicTariff?.tariffId ?? null,
            dynamicTotalEur: dynSmartTotal,
            cheapest: cheapestSmart.tariffId,
            deltaEur: r2(deltaSmart),
          },
          recommendation,
          note,
          caveat:
            "smartChargingSavings is an idealized upper bound: it assumes the full daily EV demand can be freely shifted into PV-surplus and the cheapest spot hours (11 kW cap). Real flexibility (departure times, battery competition) will capture less.",
        },
        summary,
      };
      return { structuredContent, content: summary };
    },
  );

export default await server.run();

export type AppType = typeof server;
