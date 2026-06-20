import { z } from "zod";
import { prisma } from "@enpal/db";
import { router, publicProcedure } from "../trpc";

export const pricesRouter = router({
  dynamic: publicProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ input }) => {
      const prices = await prisma.dynamicPrice.findMany({
        where: {
          timestamp: {
            gte: new Date(`${input.from}T00:00:00Z`),
            lt: new Date(`${input.to}T00:00:00Z`),
          },
        },
        orderBy: { timestamp: "asc" },
      });
      return prices.map((p) => ({
        timestamp: p.timestamp.toISOString(),
        spot: p.spotPriceEurPerKwh,
      }));
    }),
});
