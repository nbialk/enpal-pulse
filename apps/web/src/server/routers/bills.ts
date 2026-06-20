import { z } from "zod";
import { prisma, buildHouseholdFacts } from "@enpal/db";
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
      const fixed = await prisma.tariff.findFirst({ where: { type: "fixed" } });

      // Tariff counterfactual from the shared insight engine: actual annual
      // import cost vs. the alternative tariff, using real grid import (not a
      // flat consumption proxy). Feed-in is tariff-independent, so it cancels.
      const facts = await buildHouseholdFacts(prisma, input.householdId);
      const actualBill = facts?.actualEnergyEur ?? 0;
      const standardBill =
        facts?.tariffType === "fixed"
          ? facts.dynamicEnergyEur
          : (facts?.fixedEnergyEur ?? 0);

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

      const alternativeName =
        facts?.tariffType === "fixed"
          ? "dynamischen Tarif"
          : (fixed?.name ?? "Standardtarif");

      return {
        actualBill,
        standardBill,
        savings,
        savingsPct: standardBill > 0 ? (savings / standardBill) * 100 : 0,
        standardTariffName: alternativeName,
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
