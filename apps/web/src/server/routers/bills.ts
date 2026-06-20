import { z } from "zod";
import { prisma } from "@enpal/db";
import { router, publicProcedure } from "../trpc";

export const billsRouter = router({
  byHousehold: publicProcedure
    .input(z.object({ householdId: z.string() }))
    .query(async ({ input }) => {
      return prisma.monthlyBill.findMany({
        where: { householdId: input.householdId },
        orderBy: { month: "asc" },
      });
    }),

  // "Am I saving money?" — real annual bill vs. a plain standard (fixed) tariff,
  // plus a live price nudge based on the most recent energy record ("now").
  savings: publicProcedure
    .input(z.object({ householdId: z.string() }))
    .query(async ({ input }) => {
      const bills = await prisma.monthlyBill.findMany({
        where: { householdId: input.householdId },
        orderBy: { month: "asc" },
      });

      // Standard reference: the flat "fixed" tariff every German household could pick.
      const fixed = await prisma.tariff.findFirst({ where: { type: "fixed" } });
      const standardRate = fixed?.energyRateEur ?? 0.349;
      const standardBaseFee = fixed?.baseFeeEur ?? 11.5;

      const totalConsumption = bills.reduce((s, b) => s + b.consumptionKwh, 0);
      const actualBill = bills.reduce((s, b) => s + b.totalBillEur, 0);

      // What the same consumption would cost on the standard flat tariff,
      // keeping the household's PV feed-in credit (PV is not affected by tariff choice).
      const feedInCredit = bills.reduce((s, b) => s + b.feedInCreditEur, 0);
      const standardBill =
        totalConsumption * standardRate +
        standardBaseFee * bills.length -
        feedInCredit;

      const savings = standardBill - actualBill;

      // Live price "now" = most recent energy record for this household.
      const latest = await prisma.energyRecord.findFirst({
        where: { householdId: input.householdId },
        orderBy: { timestamp: "desc" },
      });

      // Where does the current price sit within the last 24h? (cheap / typical / pricey)
      let priceContext: "cheap" | "typical" | "pricey" | null = null;
      let pvSurplus = false;
      if (latest) {
        const dayAgo = new Date(latest.timestamp.getTime() - 86_400_000);
        const window = await prisma.energyRecord.findMany({
          where: {
            householdId: input.householdId,
            timestamp: { gte: dayAgo, lte: latest.timestamp },
          },
          select: { priceEurPerKwh: true },
        });
        const prices = window.map((r) => r.priceEurPerKwh).sort((a, b) => a - b);
        const p33 = prices[Math.floor(prices.length * 0.33)] ?? latest.priceEurPerKwh;
        const p66 = prices[Math.floor(prices.length * 0.66)] ?? latest.priceEurPerKwh;
        priceContext =
          latest.priceEurPerKwh <= p33
            ? "cheap"
            : latest.priceEurPerKwh >= p66
              ? "pricey"
              : "typical";
        pvSurplus = latest.gridExportKw > 0.3;
      }

      return {
        actualBill,
        standardBill,
        savings,
        savingsPct: standardBill > 0 ? (savings / standardBill) * 100 : 0,
        standardTariffName: fixed?.name ?? "Standardtarif",
        now: latest
          ? {
              timestamp: latest.timestamp.toISOString(),
              price: latest.priceEurPerKwh,
              priceContext,
              pvSurplus,
              batterySocPct: latest.batterySocPct,
            }
          : null,
      };
    }),
});
