"use client";

import {
  ArrowUpFromLine,
  Battery,
  Gauge,
  Home,
  Sparkles,
  Sun,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { LiveSnapshot } from "@/components/charts/energy-flow";

const num = (n: number, digits = 0) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const PRICE_CONTEXT: Record<string, { label: string; className: string }> = {
  cheap: { label: "cheap", className: "bg-brand/10 text-brand" },
  typical: { label: "typical", className: "bg-muted text-muted-foreground" },
  pricey: { label: "pricey", className: "bg-destructive/10 text-destructive" },
};

function socColor(pct: number) {
  return pct > 60 ? "var(--brand)" : pct > 25 ? "var(--primary)" : "var(--destructive)";
}

function BatteryRing({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const frac = Math.min(Math.max(pct / 100, 0), 1);
  const color = socColor(pct);
  return (
    <div className="relative size-12 shrink-0">
      <svg viewBox="0 0 44 44" className="size-12 -rotate-90">
        <circle
          cx={22}
          cy={22}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={3.5}
        />
        <circle
          cx={22}
          cy={22}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={`${frac * c} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Battery className="size-3 text-muted-foreground" />
        <span className="text-[11px] font-semibold tabular-nums leading-none">
          {num(pct)}
        </span>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  value,
  unit,
  label,
  accent,
}: {
  icon: LucideIcon;
  value: string;
  unit: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <Icon
        className={`size-3.5 ${accent ? "text-brand" : "text-muted-foreground"}`}
      />
      <div className="mt-1.5 text-sm font-semibold tabular-nums">
        {value}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">
          {unit}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function HouseholdInsights({ live }: { live: LiveSnapshot | null }) {
  const balance = live?.balance ?? null;
  const ctx = live?.priceContext ? PRICE_CONTEXT[live.priceContext] : null;

  return (
    <div className="flex h-full flex-col gap-px bg-border">
      {/* Live status */}
      <div className="bg-card p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {live?.pvSurplus ? (
            <Sparkles className="size-3.5 text-brand" />
          ) : (
            <Zap className="size-3.5" />
          )}
          Right now
        </div>

        {live ? (
          <div className="mt-3 flex items-center justify-between gap-4 animate-in fade-in">
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold tabular-nums">
                  {num(live.price, 2)}
                </span>
                <span className="text-xs text-muted-foreground">€/kWh</span>
              </div>
              {ctx && (
                <span
                  className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ctx.className}`}
                >
                  {ctx.label}
                </span>
              )}
            </div>
            <BatteryRing pct={live.batterySocPct} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Loading live data.
          </p>
        )}
      </div>

      {/* Daily balance */}
      <div className="flex flex-1 flex-col bg-card p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Daily balance{live ? ` · until ${live.clock}` : ""}
        </div>

        {balance ? (
          <div className="mt-3 flex flex-1 flex-col justify-between gap-3 animate-in fade-in">
            <div className="grid grid-cols-2 gap-2">
              <MetricTile
                icon={Sun}
                value={num(balance.pv, 1)}
                unit="kWh"
                label="Solar yield"
                accent
              />
              <MetricTile
                icon={Home}
                value={num(balance.consumption, 1)}
                unit="kWh"
                label="Consumption"
              />
              <MetricTile
                icon={Zap}
                value={num(balance.gridImport, 1)}
                unit="kWh"
                label="Grid import"
              />
              <MetricTile
                icon={ArrowUpFromLine}
                value={num(balance.gridExport, 1)}
                unit="kWh"
                label="Grid export"
                accent
              />
            </div>

            {/* Self-consumption — the household success metric */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Gauge className="size-3.5" />
                  Self-consumption
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {num(balance.selfConsumption)}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                    %
                  </span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
                  style={{
                    width: `${Math.min(Math.max(balance.selfConsumption, 0), 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Loading data.
          </p>
        )}
      </div>
    </div>
  );
}
