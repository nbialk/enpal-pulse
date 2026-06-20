import "@/index.css";

import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";

export default function MonthlyBills() {
  const { theme } = useLayout();
  const { output, isPending } = useToolInfo<"monthly-bills">();

  if (isPending || !output) {
    return <div className="bg-background p-4 text-foreground">Loading…</div>;
  }

  const data = output.months.map((m) => ({
    month: m.month.slice(5),
    bill: m.totalBillEur,
    selfSufficiency: m.selfSufficiencyPct,
  }));

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} bg-background text-foreground p-4`}
    >
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Monthly bills & self-sufficiency — {output.householdId}
      </h2>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="currentColor" />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="currentColor" />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
          />
          <Tooltip />
          <Bar yAxisId="left" dataKey="bill" name="Bill (€)" fill="#ea580c" radius={[4, 4, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="selfSufficiency"
            name="Self-sufficiency (%)"
            stroke="#16a34a"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
