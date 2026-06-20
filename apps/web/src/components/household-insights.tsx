"use client";

import { useMemo } from "react";
import { Battery, Sparkles, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

const num = (n: number, digits = 0) =>
  n.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const PRICE_CONTEXT: Record<string, { label: string; className: string }> = {
  cheap: { label: "günstig", className: "text-brand" },
  typical: { label: "typisch", className: "text-muted-foreground" },
  pricey: { label: "teuer", className: "text-destructive" },
};

function Row({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

export function HouseholdInsights({ householdId }: { householdId: string }) {
  const savings = trpc.bills.savings.useQuery({ householdId });
  const days = trpc.energy.availableDays.useQuery({ householdId });
  const day = days.data?.defaultDay ?? null;

  const intraday = trpc.energy.intraday.useQuery(
    { householdId, day: day ?? "" },
    { enabled: !!day },
  );

  // Daily balance: kW samples are 15-min apart -> kWh = sum(kW) * 0.25.
  const balance = useMemo(() => {
    const rows = intraday.data;
    if (!rows?.length) return null;
    const pv = rows.reduce((s, r) => s + r.pv, 0) * 0.25;
    const consumption = rows.reduce((s, r) => s + r.consumption, 0) * 0.25;
    const gridImport = rows.reduce((s, r) => s + r.gridImport, 0) * 0.25;
    const gridExport = rows.reduce((s, r) => s + r.gridExport, 0) * 0.25;
    const selfConsumption = pv > 0 ? ((pv - gridExport) / pv) * 100 : 0;
    return { pv, consumption, gridImport, gridExport, selfConsumption };
  }, [intraday.data]);

  const now = savings.data?.now;
  const ctx = now?.priceContext ? PRICE_CONTEXT[now.priceContext] : null;

  return (
    <div className="flex h-full flex-col gap-px bg-border">
      {/* Live status */}
      <div className="bg-card p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {now?.pvSurplus ? (
            <Sparkles className="size-3.5 text-brand" />
          ) : (
            <Zap className="size-3.5" />
          )}
          Jetzt gerade
        </div>

        {now ? (
          <div className="mt-3 space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Strompreis</span>
              <span className="text-sm font-semibold tabular-nums">
                {num(now.price, 2)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  €/kWh
                </span>
                {ctx && (
                  <span className={`ml-1.5 text-xs font-medium ${ctx.className}`}>
                    {ctx.label}
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Solarüberschuss
              </span>
              <span
                className={`text-sm font-semibold ${
                  now.pvSurplus ? "text-brand" : "text-muted-foreground"
                }`}
              >
                {now.pvSurplus ? "ja" : "nein"}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Battery className="size-3.5" />
                Batterie
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {num(now.batterySocPct)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  %
                </span>
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Live-Daten werden geladen.
          </p>
        )}
      </div>

      {/* Daily balance */}
      <div className="flex-1 bg-card p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tagesbilanz
        </div>

        {balance ? (
          <div className="mt-3 space-y-2.5">
            <Row label="Solarertrag" value={num(balance.pv, 1)} unit="kWh" />
            <Row
              label="Verbrauch"
              value={num(balance.consumption, 1)}
              unit="kWh"
            />
            <Row
              label="Netzbezug"
              value={num(balance.gridImport, 1)}
              unit="kWh"
            />
            <Row
              label="Einspeisung"
              value={num(balance.gridExport, 1)}
              unit="kWh"
            />
            <Row
              label="Eigenverbrauch"
              value={num(balance.selfConsumption)}
              unit="%"
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Daten werden geladen.
          </p>
        )}
      </div>
    </div>
  );
}
