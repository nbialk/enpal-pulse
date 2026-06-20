import "@/index.css";

import { Car, Droplets, Thermometer, WashingMachine, type LucideIcon } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";

const PRICE = "var(--color-destructive)";
const PV = "#16a34a";
const WINDOW = "var(--color-primary)";

const APPLIANCE_ICONS: Record<string, LucideIcon> = {
  ev: Car,
  "washing-machine": WashingMachine,
  dishwasher: Droplets,
  "heat-pump": Thermometer,
};

export default function BestTimeToRun() {
  const { theme } = useLayout();
  const { output, isPending } = useToolInfo<"best-time-to-run">();

  if (isPending || !output) {
    return <div className="bg-background p-4 text-foreground">Loading…</div>;
  }

  const wrap = `${theme === "dark" ? "dark" : ""} bg-background text-foreground p-4`;
  const Icon = APPLIANCE_ICONS[output.appliance] ?? Car;

  if (!output.window) {
    return (
      <div className={wrap}>
        <h2 className="text-sm font-medium text-muted-foreground">
          {output.applianceLabel} — {output.name} · {output.dateLabel}
        </h2>
        <p className="mt-2 text-sm">{output.reason}</p>
      </div>
    );
  }

  const data = output.slots.map((s) => ({
    clock: s.clock,
    price: Number((s.price * 100).toFixed(2)), // ct/kWh
    pvSurplus: s.pvSurplus,
  }));

  const windowSlots = output.slots.filter((s) => s.inWindow);
  const x1 = windowSlots[0]?.clock;
  const x2 = windowSlots[windowSlots.length - 1]?.clock;

  // Only show a tick every 4 hours to keep the axis readable.
  const ticks = data.filter((_, i) => i % 16 === 0).map((d) => d.clock);

  return (
    <div className={wrap}>
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Icon className="h-4 w-4" /> {output.applianceLabel} · {output.name}
          </h2>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
            {output.window.start}
            <span className="mx-1 text-muted-foreground">–</span>
            {output.window.end}
            <span className="ml-2 align-middle text-sm font-normal capitalize text-muted-foreground">
              {output.dateLabel}
            </span>
          </p>
        </div>
        <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
          {output.tariffType === "fixed" ? "Fester Tarif" : "Dynamischer Tarif"}
        </span>
      </div>

      <div className="mt-3 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="clock"
              ticks={ticks}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="price"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <YAxis yAxisId="pv" hide />
            {x1 && x2 && (
              <ReferenceArea
                yAxisId="price"
                x1={x1}
                x2={x2}
                fill={WINDOW}
                fillOpacity={0.16}
                stroke={WINDOW}
                strokeOpacity={0.4}
              />
            )}
            <Area
              yAxisId="pv"
              type="monotone"
              dataKey="pvSurplus"
              stroke={PV}
              strokeWidth={1.5}
              fill={PV}
              fillOpacity={0.12}
              dot={false}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke={PRICE}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex items-center gap-4 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3" style={{ background: PRICE }} /> Preis (ct/kWh)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: PV, opacity: 0.4 }} /> Solarüberschuss (kW)
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Geschätzte Kosten" value={`${output.effectiveCostEur!.toFixed(2)} €`} />
        <Stat label="Ersparnis" value={`${output.savingsEur!.toFixed(2)} €`} />
        <Stat label="PV-Anteil" value={`${output.pvSharePct} %`} />
      </div>

      <p className="mt-3 px-1 text-sm leading-snug text-muted-foreground">{output.reason}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
