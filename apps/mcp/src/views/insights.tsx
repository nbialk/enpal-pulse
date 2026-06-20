import "@/index.css";

import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";

export default function Insights() {
  const { theme } = useLayout();
  const { output, isPending } = useToolInfo<"insights">();

  if (isPending || !output) {
    return <div className="bg-background p-4 text-foreground">Loading…</div>;
  }

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} bg-background text-foreground p-4`}
    >
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Insights & nudges — {output.householdId}
      </h2>
      <ul className="space-y-2">
        {output.events.map((e, i) => (
          <li key={i} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                  e.severity === "high"
                    ? "border-red-500/50 text-red-500"
                    : "border-border text-muted-foreground"
                }`}
              >
                {e.type}
              </span>
              <span className="text-sm font-medium">{e.title}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{e.detail}</p>
            <p className="mt-1 text-xs text-primary">→ {e.suggestedAction}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
