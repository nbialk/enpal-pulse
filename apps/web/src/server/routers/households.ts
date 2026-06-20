import { prisma } from "@enpal/db";
import { router, publicProcedure } from "../trpc";

export const householdsRouter = router({
  list: publicProcedure.query(async () => {
    return prisma.household.findMany({
      orderBy: { householdId: "asc" },
      include: { tariff: true },
    });
  }),
  byId: publicProcedure
    .input((val: unknown) => String(val))
    .query(async (opts) => {
      return prisma.household.findUniqueOrThrow({
        where: { householdId: opts.input },
        include: { tariff: true, contract: true },
      });
    }),
});
