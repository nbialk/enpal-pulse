import "@/index.css";

import { useLayout } from "skybridge/web";
import { useToolInfo, useCallTool } from "../helpers.js";

export default function ListHouseholds() {
  const { theme } = useLayout();
  const { output } = useToolInfo<"list-households">();
  const { callTool } = useCallTool("household-overview");

  const households = output?.households ?? [];

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} bg-background text-foreground p-4`}
    >
      <h2 className="mb-3 text-base font-semibold">Households</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {households.map((h) => (
          <button
            key={h.id}
            onClick={() => callTool({ householdId: h.id })}
            className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary"
          >
            <div className="text-sm font-medium">{h.name}</div>
            <div className="text-xs text-muted-foreground">
              {h.city} · {h.residents} residents
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              {h.pvKwp} kWp PV
              {h.batteryKwh ? ` · ${h.batteryKwh} kWh battery` : ""}
              {h.heatPump ? " · heat pump" : ""}
              {h.evCharger ? " · EV" : ""}
            </div>
            <div className="mt-1.5 text-xs text-primary">{h.tariff}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
