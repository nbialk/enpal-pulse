import "@/index.css";

import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default function HouseholdOverview() {
  const { theme } = useLayout();
  const { output, isPending } = useToolInfo<"household-overview">();

  if (isPending || !output) {
    return <div className="bg-background p-4 text-foreground">Loading…</div>;
  }

  const y = output.year2025;
  const a = output.assets;

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} bg-background text-foreground p-4`}
    >
      <div className="mb-3">
        <h2 className="text-base font-semibold">{output.name}</h2>
        <p className="text-xs text-muted-foreground">
          {output.city} · {output.residents} residents · {output.tariff}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Annual bill" value={`${y.totalBillEur} €`} />
        <Stat label="Self-sufficiency" value={`${y.avgSelfSufficiencyPct} %`} />
        <Stat label="PV production" value={`${y.pvProductionKwh} kWh`} />
        <Stat label="Consumption" value={`${y.consumptionKwh} kWh`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded border border-border px-2 py-1">
          {a.pvKwp} kWp PV
        </span>
        {a.batteryKwh > 0 && (
          <span className="rounded border border-border px-2 py-1">
            {a.batteryKwh} kWh battery
          </span>
        )}
        {a.heatPump && (
          <span className="rounded border border-border px-2 py-1">Heat pump</span>
        )}
        {a.evCharger && (
          <span className="rounded border border-border px-2 py-1">EV charger</span>
        )}
      </div>
    </div>
  );
}
