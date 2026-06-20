import { prisma } from "./db.js";

/**
 * The simulated "now" inside the historical 2025 dataset.
 *
 * Hard rule for honesty (no cheating): no tool may ever read an
 * `energy_records` / `dynamic_prices` row with `timestamp > getNow()`.
 * Forecasts must be *estimated* from history (timestamp <= NOW), never
 * peeked from the actual future rows.
 *
 * Default = the very last data point in the dataset. Override with the
 * `DEMO_NOW` env var (ISO string) to anchor "now" earlier in a day, e.g.
 * `DEMO_NOW=2025-12-31T08:00:00Z`.
 */
let cached: Date | null = null;

export async function getNow(): Promise<Date> {
  const override = process.env.DEMO_NOW;
  if (override) return new Date(override);
  if (cached) return cached;
  const row = await prisma.energyRecord.findFirst({
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  cached = row?.timestamp ?? new Date("2025-12-31T23:45:00Z");
  return cached;
}

/** Calendar day (UTC, YYYY-MM-DD) of a date. */
export function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add whole days to a date (UTC). */
export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}
