"use client";

import { trpc } from "@/lib/trpc/client";

const SEVERITY: Record<string, string> = {
  high: "border-red-500/40 text-red-500",
  info: "border-border text-muted-foreground",
};

export function InsightsFeed({ householdId }: { householdId: string }) {
  const insights = trpc.insights.byHousehold.useQuery({ householdId });

  if (!insights.data) {
    return <div className="h-32 animate-pulse rounded bg-muted" />;
  }

  if (insights.data.length === 0) {
    return <p className="text-sm text-muted-foreground">No insights yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {insights.data.map((i) => (
        <li
          key={i.id}
          className="rounded-lg border border-border bg-background/40 p-4"
        >
          <div className="flex items-center gap-2">
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                SEVERITY[i.severity] ?? SEVERITY.info
              }`}
            >
              {i.type}
            </span>
            <span className="text-sm font-medium">{i.title}</span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{i.detail}</p>
          <p className="mt-1.5 text-xs text-brand">→ {i.suggestedAction}</p>
        </li>
      ))}
    </ul>
  );
}
