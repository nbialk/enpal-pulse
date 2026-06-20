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
});
