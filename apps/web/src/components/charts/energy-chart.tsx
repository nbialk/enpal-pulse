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

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

const RANGES = MONTHS.map((label, i) => ({
  label,
  from: `2025-${pad(i + 1)}-01`,
  to: i === 11 ? "2026-01-01" : `2025-${pad(i + 2)}-01`,
}));

export function EnergyChart({ householdId }: { householdId: string }) {
  const [range, setRange] = useState(RANGES[6]);
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
        <select
          value={range.label}
          onChange={(e) =>
            setRange(RANGES.find((r) => r.label === e.target.value) ?? RANGES[6])
          }
          className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary/50 focus:border-primary focus:outline-none"
        >
          {RANGES.map((r) => (
            <option key={r.label} value={r.label}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {!daily.data ? (
        <div className="h-64 animate-pulse rounded bg-muted" />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
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
              stroke="var(--brand)"
              fill="url(#pv)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
