"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  CircleAlert,
  Info,
  PiggyBank,
  Clock,
  TrendingUp,
  Plug,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";

const TYPE_ICON: Record<string, LucideIcon> = {
  tariff_mismatch: PiggyBank,
  tariff_optimal: CheckCircle2,
  load_shift: Clock,
  bill_spike: TrendingUp,
  standby_load: Plug,
};

const eur = (n: number) =>
  n.toLocaleString("de-DE", { maximumFractionDigits: 0 });

export function InsightCard({ householdId }: { householdId: string }) {
  const feed = trpc.insights.feed.useQuery({ householdId });
  const items = feed.data ?? [];
  const [index, setIndex] = useState(0);

  // Reset to the top insight whenever the household (and thus feed) changes.
  useEffect(() => {
    setIndex(0);
  }, [householdId]);

  if (feed.isLoading) {
    return <div className="h-28 animate-pulse rounded-xl bg-muted" />;
  }
  if (items.length === 0) return null;

  const safeIndex = Math.min(index, items.length - 1);
  const current = items[safeIndex]!;
  const Icon =
    TYPE_ICON[current.type] ??
    (current.severity === "high" ? CircleAlert : Info);
  const high = current.severity === "high";
  const hasMany = items.length > 1;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Lightbulb className="size-3.5 text-brand" />
          Hinweise für dich
        </div>
        {hasMany && (
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              {safeIndex + 1} / {items.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setIndex((i) => (i - 1 + items.length) % items.length)
                }
                className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Vorheriger Hinweis"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => setIndex((i) => (i + 1) % items.length)}
                className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Nächster Hinweis"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3.5 px-4 py-4">
        <div
          className={`grid size-9 shrink-0 place-items-center rounded-full ${
            high ? "bg-destructive/10" : "bg-brand/10"
          }`}
        >
          <Icon
            className={`size-4.5 ${high ? "text-destructive" : "text-brand"}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold leading-snug">
              {current.title}
            </h3>
            {current.impactEur != null && current.impactEur > 0 && (
              <span className="shrink-0 text-sm font-semibold tabular-nums text-brand">
                {eur(current.impactEur)} €/Jahr
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {current.detail}
          </p>
          {current.suggestedAction &&
            current.suggestedAction !== "Keine Aktion nötig." && (
              <p className="mt-2 text-sm font-medium">
                → {current.suggestedAction}
              </p>
            )}
        </div>
      </div>

      {hasMany && (
        <div className="flex items-center justify-center gap-1.5 pb-3">
          {items.map((it, i) => (
            <button
              key={it.id}
              onClick={() => setIndex(i)}
              aria-label={`Hinweis ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === safeIndex
                  ? "w-5 bg-brand"
                  : "w-1.5 bg-border hover:bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
