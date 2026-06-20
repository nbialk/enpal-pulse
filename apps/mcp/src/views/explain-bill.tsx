import "@/index.css";

import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";

const eur = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const signedEur = (n: number) => `${n >= 0 ? "+" : "−"}${eur(Math.abs(n))}`;

// Consumption-area colors (match daily-energy-flow: house = foreground/primary,
// heat pump = sky, EV = green).
const AREAS = [
  { key: "houseKwh", label: "House load", color: "var(--color-primary)" },
  { key: "heatpumpKwh", label: "Heat pump", color: "#0ea5e9" },
  { key: "evKwh", label: "EV charging", color: "#16a34a" },
] as const;

export default function ExplainBill() {
  const { theme } = useLayout();
  const { output, isPending } = useToolInfo<"explain-bill">();

  if (isPending || !output) {
    return <div className="bg-background p-4 text-foreground">Loading…</div>;
  }

  const wrap = `${theme === "dark" ? "dark" : ""} bg-background text-foreground p-4`;

  if (!output.month || !output.context) {
    return (
      <div className={wrap}>
        <h2 className="text-sm font-medium text-muted-foreground">
          Bill analysis — {output.name}
        </h2>
        <p className="mt-2 text-sm">
          Not enough monthly bills for a comparison.
        </p>
      </div>
    );
  }

  const higher = output.deltaEur >= 0;

  const months = output.monthlyConsumption ?? [];
  const multiMonth = months.length >= 2;
  // Only show areas that have any consumption across the window.
  const activeAreas = AREAS.filter((a) =>
    months.some((m) => (m[a.key] as number) > 0),
  );

  return (
    <div className={wrap}>
      {/* Plain-language headline: the answer first. */}
      <h2 className="text-sm font-medium text-muted-foreground">
        Why was the bill {higher ? "higher" : "lower"}? — {output.name}
      </h2>
      <p className="mt-1 text-lg leading-snug font-medium">
        <span className="text-2xl font-semibold tabular-nums">
          {eur(output.totalEur)}
        </span>{" "}
        in {output.monthLabel} —{" "}
        <span
          className={`font-semibold ${higher ? "text-red-500" : "text-green-600"}`}
        >
          {eur(Math.abs(output.deltaEur))} {higher ? "more" : "less"}
        </span>{" "}
        than in {output.compareLabel}.
        {output.mainReason && (
          <>
            {" "}
            Main reason: <span className="font-semibold">{output.mainReason}</span>
          </>
        )}
      </p>

      {multiMonth ? (
        /* Stacked monthly consumption by area (kWh). */
        <div className="mt-3">
          <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">
            Consumption by area (kWh)
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={months}
                margin={{ top: 4, right: 4, bottom: 0, left: -8 }}
              >
                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeOpacity={0.4}
                  vertical={false}
                />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--color-foreground)",
                  }}
                  formatter={(v: number, name: string) => [`${v} kWh`, name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  iconType="circle"
                  iconSize={8}
                />
                {activeAreas.map((a, i) => (
                  <Bar
                    key={a.key}
                    dataKey={a.key}
                    name={a.label}
                    stackId="consumption"
                    fill={a.color}
                    radius={
                      i === activeAreas.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]
                    }
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        /* Before → after at a glance. */
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">
              {output.compareLabel}
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {eur(output.compareTotalEur)}
            </div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">
              {output.monthLabel}
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {eur(output.totalEur)}
            </div>
          </div>
          <span
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${
              higher
                ? "bg-red-500/10 text-red-500"
                : "bg-green-600/10 text-green-600"
            }`}
          >
            {higher ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {signedEur(output.deltaEur)}
          </span>
        </div>
      )}
    </div>
  );
}
