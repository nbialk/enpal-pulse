"use client";

import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc/client";

export function BillsChart({ householdId }: { householdId: string }) {
  const bills = trpc.bills.byHousehold.useQuery({ householdId });

  if (!bills.data) {
    return <div className="h-64 animate-pulse rounded bg-muted" />;
  }

  const data = bills.data.map((b) => ({
    month: b.month.slice(5),
    bill: Math.round(b.totalBillEur),
    selfSufficiency: Math.round(b.selfSufficiencyPct),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar
          yAxisId="left"
          dataKey="bill"
          name="Bill (€)"
          fill="var(--primary)"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="selfSufficiency"
          name="Self-sufficiency (%)"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
