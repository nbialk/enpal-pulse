"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export const ENERGY_RANGES = MONTHS.map((label, i) => ({
  label,
  from: `2025-${pad(i + 1)}-01`,
  to: i === 11 ? "2026-01-01" : `2025-${pad(i + 2)}-01`,
}));

export const ENERGY_DEFAULT_MONTH = ENERGY_RANGES[6].label;

export function EnergyMonthSelect({
  month,
  onMonthChange,
}: {
  month: string;
  onMonthChange: (month: string) => void;
}) {
  return (
    <Select value={month} onValueChange={onMonthChange}>
      <SelectTrigger size="sm" className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ENERGY_RANGES.map((r) => (
          <SelectItem key={r.label} value={r.label}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function EnergyChart({
  householdId,
  month,
}: {
  householdId: string;
  month: string;
}) {
  const range =
    ENERGY_RANGES.find((r) => r.label === month) ?? ENERGY_RANGES[6];
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
