import { z } from "zod";
import { prisma } from "@enpal/db";
import { router, publicProcedure } from "../trpc";

// Detector insights first by severity, then by annual euro impact.
const SEVERITY_RANK: Record<string, number> = { high: 0, info: 1 };

export const insightsRouter = router({
  byHousehold: publicProcedure
    .input(z.object({ householdId: z.string() }))
    .query(async ({ input }) => {
      return prisma.insightEvent.findMany({
        where: { householdId: input.householdId },
        orderBy: { id: "asc" },
      });
    }),

  // Prioritized notification feed: the deterministically generated insights,
  // ranked so the most important one can headline a banner.
  feed: publicProcedure
    .input(z.object({ householdId: z.string() }))
    .query(async ({ input }) => {
      const events = await prisma.insightEvent.findMany({
        where: { householdId: input.householdId, source: "generated" },
      });
      return events.sort(
        (a, b) =>
          (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
          (b.impactEur ?? 0) - (a.impactEur ?? 0),
      );
    }),
});
