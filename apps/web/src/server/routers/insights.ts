import { z } from "zod";
import { prisma } from "@enpal/db";
import { router, publicProcedure } from "../trpc";

export const insightsRouter = router({
  byHousehold: publicProcedure
    .input(z.object({ householdId: z.string() }))
    .query(async ({ input }) => {
      return prisma.insightEvent.findMany({
        where: { householdId: input.householdId },
        orderBy: { id: "asc" },
      });
    }),
});
