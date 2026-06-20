import { router } from "../trpc";
import { householdsRouter } from "./households";
import { billsRouter } from "./bills";
import { insightsRouter } from "./insights";
import { energyRouter } from "./energy";
import { pricesRouter } from "./prices";

export const appRouter = router({
  households: householdsRouter,
  bills: billsRouter,
  insights: insightsRouter,
  energy: energyRouter,
  prices: pricesRouter,
});

export type AppRouter = typeof appRouter;
