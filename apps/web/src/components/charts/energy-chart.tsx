"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc/client";

const RANGES = [
  { label: "January", from: "2025-01-01", to: "2025-02-01" },
  { label: "April", from: "2025-04-01", to: "2025-05-01" },
  { label: "July", from: "2025-07-01", to: "2025-08-01" },
  { label: "October", from: "2025-10-01", to: "2025-11-01" },
];

export function EnergyChart({ householdId }: { householdId: string }) {
  const [range, setRange] = useState(RANGES[2]);
  const daily = trpc.energy.daily.useQuery({
    householdId,
    from: range.from,
    to: range.to,
  });

  const data =
    daily.data?.map((d) => ({
      day: d.day.slice(8),
      PV: Math.round(d.pvKwh),
      Consumption: Math.round(d.consumptionKwh),
      "Grid import": Math.round(d.gridImportKwh),
    })) ?? [];

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setRange(r)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              r.label === range.label
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {!daily.data ? (
        <div className="h-64 animate-pulse rounded bg-muted" />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cons" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="Consumption"
              stroke="var(--primary)"
              fill="url(#cons)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="PV"
              stroke="var(--accent)"
              fill="url(#pv)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
