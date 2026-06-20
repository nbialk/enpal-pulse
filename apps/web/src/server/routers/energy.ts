import { z } from "zod";
import { prisma } from "@enpal/db";
import { router, publicProcedure } from "../trpc";

type DailyRow = {
  day: Date;
  pv_kwh: number;
  consumption_kwh: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  battery_charge_kwh: number;
  battery_discharge_kwh: number;
  avg_soc_pct: number;
};

export const energyRouter = router({
  // Daily rollups (kW averaged over 15-min steps -> *0.25 for kWh) for a date range.
  daily: publicProcedure
    .input(
      z.object({
        householdId: z.string(),
        from: z.string(),
        to: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const rows = await prisma.$queryRaw<DailyRow[]>`
        SELECT
          date_trunc('day', timestamp) AS day,
          SUM(pv_production_kw) * 0.25 AS pv_kwh,
          SUM(total_consumption_kw) * 0.25 AS consumption_kwh,
          SUM(grid_import_kw) * 0.25 AS grid_import_kwh,
          SUM(grid_export_kw) * 0.25 AS grid_export_kwh,
          SUM(battery_charge_kw) * 0.25 AS battery_charge_kwh,
          SUM(battery_discharge_kw) * 0.25 AS battery_discharge_kwh,
          AVG(battery_soc_pct) AS avg_soc_pct
        FROM energy_records
        WHERE household_id = ${input.householdId}
          AND timestamp >= ${new Date(`${input.from}T00:00:00Z`)}
          AND timestamp < ${new Date(`${input.to}T00:00:00Z`)}
        GROUP BY day
        ORDER BY day ASC
      `;
      return rows.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        pvKwh: Number(r.pv_kwh),
        consumptionKwh: Number(r.consumption_kwh),
        gridImportKwh: Number(r.grid_import_kwh),
        gridExportKwh: Number(r.grid_export_kwh),
        batteryChargeKwh: Number(r.battery_charge_kwh),
        batteryDischargeKwh: Number(r.battery_discharge_kwh),
        avgSocPct: Number(r.avg_soc_pct),
      }));
    }),

  // Raw 15-min records for a single day (for an intraday energy-balance view).
  intraday: publicProcedure
    .input(z.object({ householdId: z.string(), day: z.string() }))
    .query(async ({ input }) => {
      const start = new Date(`${input.day}T00:00:00Z`);
      const end = new Date(start.getTime() + 86_400_000);
      const records = await prisma.energyRecord.findMany({
        where: {
          householdId: input.householdId,
          timestamp: { gte: start, lt: end },
        },
        orderBy: { timestamp: "asc" },
      });
      return records.map((r) => ({
        time: r.timestamp.toISOString().slice(11, 16),
        pv: r.pvProductionKw,
        consumption: r.totalConsumptionKw,
        gridImport: r.gridImportKw,
        gridExport: r.gridExportKw,
        soc: r.batterySocPct,
        price: r.priceEurPerKwh,
      }));
    }),
});
