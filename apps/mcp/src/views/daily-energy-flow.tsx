import "@/index.css";

import {
  Battery,
  BatteryCharging,
  Car,
  Home,
  Sun,
  Thermometer,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";

// Color mapping to the Alpic UI theme tokens (no --brand/--chart-2 here).
const SOLAR = "#16a34a";
const SUB = "#0ea5e9";
const GRID = "var(--color-destructive)";
const BATTERY = "var(--color-primary)";
const FOREGROUND = "var(--color-foreground)";

// SVG canvas — compact radial composition around the house.
const W = 560;
const H = 300;
const NODE_R = 30;

type NodeDef = {
  x: number;
  y: number;
  label: string;
  icon: LucideIcon;
  color: string;
  r?: number;
};

const NODES = {
  pv: { x: 280, y: 52, label: "Solar", icon: Sun, color: SOLAR },
  grid: { x: 80, y: 168, label: "Grid", icon: Zap, color: GRID },
  battery: { x: 480, y: 168, label: "Battery", icon: Battery, color: BATTERY },
  house: { x: 280, y: 168, label: "House", icon: Home, color: FOREGROUND },
  heatpump: { x: 214, y: 244, label: "Heat pump", icon: Thermometer, color: SUB, r: 22 },
  ev: { x: 346, y: 244, label: "EV", icon: Car, color: SUB, r: 22 },
} as const satisfies Record<string, NodeDef>;

type NodeKey = keyof typeof NODES;
const getR = (key: NodeKey): number => {
  const n = NODES[key] as NodeDef;
  return n.r ?? NODE_R;
};

type Snapshot = {
  pv: number;
  consumption: number;
  houseLoad: number;
  heatpump: number;
  ev: number;
  gridImport: number;
  gridExport: number;
  batteryCharge: number;
  batteryDischarge: number;
  soc: number;
  socKwh: number;
  price: number;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

const nodeR = (key: NodeKey) => getR(key);

function nodePath(from: NodeKey, to: NodeKey) {
  const a = NODES[from];
  const b = NODES[to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ax = a.x + ux * nodeR(from);
  const ay = a.y + uy * nodeR(from);
  const bx = b.x - ux * nodeR(to);
  const by = b.y - uy * nodeR(to);
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const nudge = 14;
  const cx = mx + -uy * nudge;
  const cy = my + ux * nudge;
  return `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
}

const strokeWidth = (kw: number) => Math.max(2, Math.min(6, 2 + kw * 0.8));

type Edge = { id: string; from: NodeKey; to: NodeKey; value: number; color: string };

const EDGE_DEFS: {
  id: string;
  from: NodeKey;
  to: NodeKey;
  colorKey: NodeKey;
  needs?: "hp" | "ev";
}[] = [
  { id: "pv-house", from: "pv", to: "house", colorKey: "pv" },
  { id: "pv-battery", from: "pv", to: "battery", colorKey: "pv" },
  { id: "pv-grid", from: "pv", to: "grid", colorKey: "pv" },
  { id: "grid-house", from: "grid", to: "house", colorKey: "grid" },
  { id: "battery-house", from: "battery", to: "house", colorKey: "battery" },
  { id: "house-hp", from: "house", to: "heatpump", colorKey: "heatpump", needs: "hp" },
  { id: "house-ev", from: "house", to: "ev", colorKey: "ev", needs: "ev" },
];

function buildEdges(s: Snapshot, hasHeatPump: boolean, hasEv: boolean): Edge[] {
  const pvToBattery = Math.min(s.pv, s.batteryCharge);
  const pvToGrid = Math.min(Math.max(s.pv - pvToBattery, 0), s.gridExport);
  const pvToHouse = Math.max(s.pv - pvToBattery - pvToGrid, 0);

  const values: Record<string, number> = {
    "pv-house": pvToHouse,
    "pv-battery": pvToBattery,
    "pv-grid": pvToGrid,
    "grid-house": s.gridImport,
    "battery-house": s.batteryDischarge,
    "house-hp": s.heatpump,
    "house-ev": s.ev,
  };

  return EDGE_DEFS.filter(
    (d) => (d.needs !== "hp" || hasHeatPump) && (d.needs !== "ev" || hasEv),
  ).map((d) => ({
    id: d.id,
    from: d.from,
    to: d.to,
    value: values[d.id] ?? 0,
    color: NODES[d.colorKey].color,
  }));
}

export default function DailyEnergyFlow() {
  const { theme } = useLayout();
  const { output, isPending } = useToolInfo<"daily-energy-flow">();

  if (isPending || !output) {
    return <div className="bg-background p-4 text-foreground">Loading…</div>;
  }

  const wrap = `${theme === "dark" ? "dark" : ""} bg-background text-foreground p-4`;

  if (!output.snapshot) {
    return (
      <div className={wrap}>
        <h2 className="text-sm font-medium text-muted-foreground">
          Live energy flow — {output.name} · {output.dateLabel}
        </h2>
        <p className="mt-2 text-sm">No energy records for this day.</p>
      </div>
    );
  }

  const s = output.snapshot;
  const edges = buildEdges(s, output.hasHeatPump, output.hasEv);

  const visibleNodes: NodeKey[] = ["pv", "grid", "battery", "house"];
  if (output.hasHeatPump) visibleNodes.push("heatpump");
  if (output.hasEv) visibleNodes.push("ev");

  const nodeFlow: Record<NodeKey, number> = {
    pv: s.pv,
    grid: Math.abs(s.gridImport - s.gridExport),
    battery: Math.abs(s.batteryDischarge - s.batteryCharge),
    house: s.consumption,
    heatpump: s.heatpump,
    ev: s.ev,
  };

  const priceLabel =
    output.priceContext === "cheap"
      ? "Cheap power"
      : output.priceContext === "pricey"
        ? "Pricey power"
        : "Typical price";

  return (
    <div className={wrap}>
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">
            Live energy flow — {output.name}
          </h2>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
            <span className="font-mono">{output.clock}</span>
            <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
              {output.dateLabel}
            </span>
          </p>
        </div>
        <span
          className={`rounded border px-2 py-1 text-xs ${
            output.priceContext === "cheap"
              ? "border-green-600/50 text-green-600"
              : output.priceContext === "pricey"
                ? "border-red-500/50 text-red-500"
                : "border-border text-muted-foreground"
          }`}
        >
          {priceLabel} · {s.price.toFixed(3)} €/kWh
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`Energy flow at ${output.clock}`}
      >
        {edges.map((e) => {
          const d = nodePath(e.from, e.to);
          const w = strokeWidth(e.value);
          const flowOpacity = smoothstep(0.04, 0.4, e.value);
          return (
            <g key={e.id} style={{ opacity: flowOpacity }}>
              <path
                d={d}
                fill="none"
                stroke={e.color}
                strokeOpacity={0.22}
                strokeWidth={w}
                strokeLinecap="round"
              />
              {[0, 0.5].map((begin) => (
                <circle key={begin} r={w * 0.6 + 1} fill={e.color}>
                  <animateMotion
                    dur="2.2s"
                    begin={`${begin * 2.2}s`}
                    repeatCount="indefinite"
                    path={d}
                  />
                </circle>
              ))}
            </g>
          );
        })}

        {visibleNodes.map((key) => {
          const n = NODES[key];
          const flow = nodeFlow[key];
          const active = flow > 0.05;
          const signed =
            key === "grid"
              ? s.gridImport - s.gridExport
              : key === "battery"
                ? s.batteryDischarge - s.batteryCharge
                : flow;
          const valueColor =
            key === "grid"
              ? signed > 0.05
                ? GRID
                : signed < -0.05
                  ? SOLAR
                  : "var(--color-muted-foreground)"
              : key === "battery"
                ? signed > 0.05
                  ? SOLAR
                  : signed < -0.05
                    ? BATTERY
                    : "var(--color-muted-foreground)"
                : active
                  ? FOREGROUND
                  : "var(--color-muted-foreground)";

          const activeOpacity = smoothstep(0.04, 0.4, flow);
          const r = getR(key);
          const small = r < NODE_R;
          const isBattery = key === "battery";
          return (
            <g key={key} style={{ opacity: lerp(0.5, 1, activeOpacity) }}>
              <circle
                cx={n.x}
                cy={n.y}
                r={r + 4}
                fill="none"
                stroke={n.color}
                strokeOpacity={0.18 * activeOpacity}
                strokeWidth={Math.min(8, 3 + flow * 0.7)}
              />
              <circle cx={n.x} cy={n.y} r={r} fill="var(--color-card)" />

              {isBattery ? (
                <BatterySoc cx={n.x} cy={n.y} r={r} pct={s.soc} />
              ) : (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill="none"
                  stroke={active ? n.color : "var(--color-border)"}
                  strokeOpacity={active ? 0.55 : 1}
                  strokeWidth={1.5}
                />
              )}

              <NodeIcon
                icon={
                  isBattery
                    ? s.batteryCharge > 0.05
                      ? BatteryCharging
                      : Battery
                    : n.icon
                }
                x={n.x}
                y={n.y - (small ? 5 : 6)}
                color={active ? n.color : "var(--color-muted-foreground)"}
                size={small ? 16 : 20}
              />

              <text
                x={n.x}
                y={n.y + (small ? 14 : 17)}
                textAnchor="middle"
                fontSize={small ? 10 : 11}
                fontWeight={600}
                fill={valueColor}
                fontFamily="var(--font-mono)"
              >
                {`${key !== "battery" && signed < -0.05 ? "−" : ""}${Math.abs(signed).toFixed(1)} kW`}
              </text>

              <text
                x={n.x}
                y={n.y + r + 16}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-muted-foreground)"
                fontWeight={500}
              >
                {n.label}
                {isBattery ? ` · ${Math.round(s.soc)}%` : ""}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="PV today" value={`${output.balance!.pv} kWh`} />
        <Stat label="Consumed" value={`${output.balance!.consumption} kWh`} />
        <Stat label="Grid import" value={`${output.balance!.gridImport} kWh`} />
        <Stat
          label="Self-consumption"
          value={`${output.balance!.selfConsumption} %`}
        />
      </div>
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

function NodeIcon({
  icon: Icon,
  x,
  y,
  color,
  size = 20,
}: {
  icon: LucideIcon;
  x: number;
  y: number;
  color: string;
  size?: number;
}) {
  return (
    <Icon
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      stroke={color}
      strokeWidth={2}
    />
  );
}

function BatterySoc({
  cx,
  cy,
  r,
  pct,
}: {
  cx: number;
  cy: number;
  r: number;
  pct: number;
}) {
  const circumference = 2 * Math.PI * r;
  const frac = Math.min(Math.max(pct / 100, 0), 1);
  const color = pct > 60 ? SOLAR : pct > 25 ? BATTERY : GRID;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth={2.5} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={`${frac * circumference} ${circumference}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </>
  );
}
