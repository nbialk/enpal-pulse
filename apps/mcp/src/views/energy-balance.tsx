import "@/index.css";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";

export default function EnergyBalance() {
  const { theme } = useLayout();
  const { output, isPending } = useToolInfo<"energy-balance">();

  if (isPending || !output) {
    return <div className="bg-background p-4 text-foreground">Loading…</div>;
  }

  const data = output.days.map((d) => ({
    day: d.day.slice(8),
    PV: d.pvKwh,
    Consumption: d.consumptionKwh,
    "Grid import": d.gridImportKwh,
  }));

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} bg-background text-foreground p-4`}
    >
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Daily energy balance — {output.householdId} · {output.month}
      </h2>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#16a34a" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cons" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ea580c" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="currentColor" />
          <YAxis tick={{ fontSize: 11 }} stroke="currentColor" />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="Consumption"
            stroke="#ea580c"
            fill="url(#cons)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="PV"
            stroke="#16a34a"
            fill="url(#pv)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
