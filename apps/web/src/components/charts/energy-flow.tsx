"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Battery,
  BatteryCharging,
  CalendarDays,
  Car,
  Home,
  Pause,
  Play,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { format, parse } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

type Step = {
  time: string;
  pv: number;
  consumption: number;
  houseLoad: number;
  heatpump: number;
  ev: number;
  gridImport: number;
  gridExport: number;
  batteryCharge: number;
  batteryDischarge: number;
  socKwh: number;
  soc: number;
  price: number;
};

// Live state at the timeline cursor, surfaced for the side panel so its
// "Right now" values stay in sync with the diagram.
export type LiveSnapshot = {
  clock: string;
  price: number;
  priceContext: "cheap" | "typical" | "pricey" | null;
  pvSurplus: boolean;
  batterySocPct: number;
  // Live grid draw at the cursor (kW). ~0 means the house runs off solar/battery.
  gridImportNow: number;
  // Energy totals accumulated from midnight up to the cursor position.
  balance: {
    pv: number;
    consumption: number;
    gridImport: number;
    gridExport: number;
    selfConsumption: number;
    // Euro saved by self-supply: avoided grid draw priced at the spot rate.
    savedEur: number;
  };
};

// SVG canvas. Compact, balanced radial composition around the house.
const W = 560;
const H = 300;

type NodeDef = {
  x: number;
  y: number;
  label: string;
  icon: LucideIcon;
  color: string;
  r?: number; // override radius (defaults to NODE_R)
};

const NODES: Record<string, NodeDef> = {
  pv: { x: 280, y: 52, label: "Solar", icon: Sun, color: "var(--brand)" },
  grid: { x: 80, y: 168, label: "Grid", icon: Zap, color: "var(--destructive)" },
  battery: { x: 480, y: 168, label: "Battery", icon: Battery, color: "var(--primary)" },
  house: { x: 280, y: 168, label: "House", icon: Home, color: "var(--foreground)" },
  // Sub-consumers of the house: smaller and clustered close beneath it.
  heatpump: { x: 214, y: 244, label: "Heat pump", icon: Thermometer, color: "var(--chart-2)", r: 22 },
  ev: { x: 346, y: 244, label: "EV", icon: Car, color: "var(--chart-2)", r: 22 },
};

type NodeKey = keyof typeof NODES;

type Edge = {
  id: string;
  from: NodeKey;
  to: NodeKey;
  value: number; // kW, always >= 0; direction encoded by from->to
  color: string;
};

const SPEEDS = [1, 2] as const;
const STEP_MS = 1100; // ms per quarter-hour at 1x (calmer continuous flow)
const PV_ON = 0.05; // kW threshold treated as "sun is up"
const NODE_R = 30;
const PARTICLE_DUR = 2.2; // constant so SMIL never remounts/restarts

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

// Linearly interpolate every numeric field of a Step.
function lerpStep(a: Step, b: Step, t: number): Step {
  return {
    time: t < 0.5 ? a.time : b.time,
    pv: lerp(a.pv, b.pv, t),
    consumption: lerp(a.consumption, b.consumption, t),
    houseLoad: lerp(a.houseLoad, b.houseLoad, t),
    heatpump: lerp(a.heatpump, b.heatpump, t),
    ev: lerp(a.ev, b.ev, t),
    gridImport: lerp(a.gridImport, b.gridImport, t),
    gridExport: lerp(a.gridExport, b.gridExport, t),
    batteryCharge: lerp(a.batteryCharge, b.batteryCharge, t),
    batteryDischarge: lerp(a.batteryDischarge, b.batteryDischarge, t),
    socKwh: lerp(a.socKwh, b.socKwh, t),
    soc: lerp(a.soc, b.soc, t),
    price: lerp(a.price, b.price, t),
  };
}

// "Now" mapped onto the historical dataset: today shifted back one year,
// clamped into the available range. Falls back to the dataset default.
function defaultDayFor(
  min: string | null,
  max: string | null,
  fallback: string | null,
) {
  const now = new Date();
  const lastYear = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (min && lastYear < min) return min;
  if (max && lastYear > max) return max;
  return min && max ? lastYear : fallback;
}

// Fractional step index for the current wall-clock time (15-min steps).
function nowProgress() {
  const now = new Date();
  return (now.getHours() * 60 + now.getMinutes()) / 15;
}

// Continuous clock from fractional step progress (15-min steps).
function formatMinutes(progress: number) {
  const totalMin = Math.round(progress * 15);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const nodeR = (key: NodeKey) => NODES[key].r ?? NODE_R;

function nodePath(from: NodeKey, to: NodeKey) {
  const a = NODES[from];
  const b = NODES[to];
  // Trim the path to start/end at the node edge, not the center.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ax = a.x + ux * nodeR(from);
  const ay = a.y + uy * nodeR(from);
  const bx = b.x - ux * nodeR(to);
  const by = b.y - uy * nodeR(to);
  // Gentle perpendicular bow for visual separation of parallel edges.
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const nudge = 14;
  const cx = mx + -uy * nudge;
  const cy = my + ux * nudge;
  return `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
}

function strokeWidth(kw: number) {
  // 0..~10 kW -> 2..6 px
  return Math.max(2, Math.min(6, 2 + kw * 0.8));
}

// Stable edge set: always returns the same edges in the same order so the SVG
// nodes (and their SMIL particles) mount once. Only `value` changes over time;
// near-zero values fade out via opacity instead of unmounting.
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

function buildEdges(s: Step, hasHeatPump: boolean, hasEv: boolean): Edge[] {
  // Solar splits into self-use, battery charging, and grid export.
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

// Sun elevation proxy in [0,1]: 0 at night, 1 at solar noon.
function dayPhase(progress: number, riseIdx: number, setIdx: number) {
  if (progress <= riseIdx || progress >= setIdx) return 0;
  const t = (progress - riseIdx) / (setIdx - riseIdx); // 0..1 across daylight
  return Math.sin(t * Math.PI); // peaks at midday
}

// Shared live-timeline state: one source of truth for the diagram and the
// (now full-width) timeline so they stay perfectly in sync.
export type EnergyTimeline = ReturnType<typeof useEnergyTimeline>;

export function useEnergyTimeline(
  householdId: string,
  onLiveChange?: (live: LiveSnapshot | null) => void,
) {
  const household = trpc.households.byId.useQuery(householdId);
  const days = trpc.energy.availableDays.useQuery({ householdId });

  const [day, setDay] = useState<string | null>(null);
  const activeDay =
    day ??
    defaultDayFor(
      days.data?.min ?? null,
      days.data?.max ?? null,
      days.data?.defaultDay ?? null,
    );

  const intraday = trpc.energy.intraday.useQuery(
    { householdId, day: activeDay ?? "" },
    { enabled: !!activeDay },
  );

  const steps = useMemo(() => (intraday.data ?? []) as Step[], [intraday.data]);

  // Continuous fractional position across steps (e.g. 12.6 = 60% to step 13).
  // Start paused at the current wall-clock time — a "right now" snapshot.
  const [progress, setProgress] = useState(nowProgress);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  // Jump to the current time of day whenever the selected day changes.
  // Render-time adjustment per React's "storing previous value" pattern.
  const [prevDay, setPrevDay] = useState(activeDay);
  if (prevDay !== activeDay) {
    setPrevDay(activeDay);
    setProgress(nowProgress());
  }

  // Time-based animation loop: advance `progress` smoothly every frame.
  useEffect(() => {
    if (!playing || steps.length === 0) return;
    const tick = (now: number) => {
      if (!lastRef.current) lastRef.current = now;
      const dt = now - lastRef.current;
      lastRef.current = now;
      setProgress((p) => {
        const next = p + (dt / STEP_MS) * speed;
        return next % steps.length;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRef.current = 0;
    };
  }, [playing, speed, steps.length]);

  // Interpolated state between the two surrounding 15-min samples.
  const current = useMemo(() => {
    if (steps.length === 0) return undefined;
    const i0 = Math.floor(progress) % steps.length;
    const i1 = (i0 + 1) % steps.length;
    const frac = progress - Math.floor(progress);
    return lerpStep(steps[i0], steps[i1], frac);
  }, [steps, progress]);

  // Price percentiles across the day -> classify the cursor's price.
  const priceBands = useMemo(() => {
    if (steps.length === 0) return null;
    const sorted = steps.map((s) => s.price).sort((a, b) => a - b);
    return {
      p33: sorted[Math.floor(sorted.length * 0.33)],
      p66: sorted[Math.floor(sorted.length * 0.66)],
    };
  }, [steps]);

  // Energy totals from midnight up to the cursor (full steps + fractional tail).
  // kWh = sum(kW) * 0.25 (15-min samples).
  const balance = useMemo(() => {
    if (steps.length === 0) return null;
    const full = Math.floor(progress);
    const frac = progress - full;
    const acc = { pv: 0, consumption: 0, gridImport: 0, gridExport: 0 };
    let savedEur = 0;
    for (let i = 0; i < steps.length; i++) {
      const weight = i < full ? 1 : i === full ? frac : 0;
      if (weight === 0) break;
      const s = steps[i];
      acc.pv += s.pv * weight;
      acc.consumption += s.consumption * weight;
      acc.gridImport += s.gridImport * weight;
      acc.gridExport += s.gridExport * weight;
      // House demand met by solar/battery instead of the grid, valued at the
      // spot price of that interval -> euros not spent on imports.
      const selfSupplied = Math.max(s.consumption - s.gridImport, 0);
      savedEur += selfSupplied * 0.25 * s.price * weight;
    }
    const pv = acc.pv * 0.25;
    const gridExport = acc.gridExport * 0.25;
    return {
      pv,
      consumption: acc.consumption * 0.25,
      gridImport: acc.gridImport * 0.25,
      gridExport,
      selfConsumption: pv > 0 ? ((pv - gridExport) / pv) * 100 : 0,
      savedEur,
    };
  }, [steps, progress]);

  // Surface the cursor's live state to the side panel (kept in sync).
  useEffect(() => {
    if (!onLiveChange) return;
    if (!current || !balance) {
      onLiveChange(null);
      return;
    }
    const priceContext = priceBands
      ? current.price <= priceBands.p33
        ? "cheap"
        : current.price >= priceBands.p66
          ? "pricey"
          : "typical"
      : null;
    onLiveChange({
      clock: formatMinutes(progress),
      price: current.price,
      priceContext,
      pvSurplus: current.gridExport > 0.3,
      batterySocPct: current.soc,
      gridImportNow: current.gridImport,
      balance,
    });
  }, [onLiveChange, current, priceBands, progress, balance]);

  // Sunrise/sunset derived from PV activity (no dedicated solar field).
  const sun = useMemo(() => {
    const first = steps.findIndex((s) => s.pv > PV_ON);
    let last = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].pv > PV_ON) {
        last = i;
        break;
      }
    }
    if (first === -1 || last === -1) return null;
    return {
      riseIdx: first,
      setIdx: last,
      riseTime: steps[first].time,
      setTime: steps[last].time,
    };
  }, [steps]);

  const pct = (i: number) =>
    steps.length > 1 ? (i / (steps.length - 1)) * 100 : 0;

  const scrubTo = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    setPlaying(false);
    setProgress(ratio * (steps.length - 1));
  };

  return {
    household,
    days,
    activeDay,
    setDay,
    intraday,
    steps,
    progress,
    setProgress,
    playing,
    setPlaying,
    speed,
    setSpeed,
    current,
    balance,
    sun,
    pct,
    scrubTo,
  };
}

export function EnergyFlow({ timeline }: { timeline: EnergyTimeline }) {
  const {
    household,
    days,
    activeDay,
    setDay,
    intraday,
    progress,
    current,
    sun,
  } = timeline;

  const hasHeatPump = household.data?.heatPump ?? false;
  const hasEv = household.data?.evCharger ?? false;

  const edges = useMemo(
    () => (current ? buildEdges(current, hasHeatPump, hasEv) : []),
    [current, hasHeatPump, hasEv],
  );

  const visibleNodes = useMemo(() => {
    const keys: NodeKey[] = ["pv", "grid", "battery", "house"];
    if (hasHeatPump) keys.push("heatpump");
    if (hasEv) keys.push("ev");
    return keys;
  }, [hasHeatPump, hasEv]);

  if (!activeDay || !intraday.data) {
    return <Skeleton className="h-[360px] w-full rounded-xl" />;
  }

  const phase = sun ? dayPhase(progress, sun.riseIdx, sun.setIdx) : 0;
  const isNight = phase < 0.04;
  const clock = formatMinutes(progress);

  // Per-node live throughput (absolute kW) drives active/idle styling.
  const nodeFlow: Record<NodeKey, number> = {
    pv: current?.pv ?? 0,
    grid: Math.abs((current?.gridImport ?? 0) - (current?.gridExport ?? 0)),
    battery: Math.abs((current?.batteryDischarge ?? 0) - (current?.batteryCharge ?? 0)),
    house: current?.consumption ?? 0,
    heatpump: current?.heatpump ?? 0,
    ev: current?.ev ?? 0,
  };

  // Atmospheric backdrop: cool deep blue at night, warm light at midday.
  const skyTop = isNight
    ? "color-mix(in oklch, var(--card) 86%, oklch(0.45 0.09 255))"
    : `color-mix(in oklch, var(--card) ${92 - phase * 26}%, oklch(0.85 0.11 85))`;
  const skyBottom = "var(--card)";

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Header */}
      <div className="px-5 pt-5">
        <h2 className="text-sm font-medium text-muted-foreground">Live energy flow</h2>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
          <span className="font-mono">{clock}</span>
          <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
            {isNight ? "Night" : phase > 0.7 ? "Midday sun" : "Daylight"}
          </span>
        </p>
      </div>

      {/* Diagram */}
      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Energy flow at ${clock}`}
        >
          <defs>
            <linearGradient id="ef-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={skyTop} />
              <stop offset="100%" stopColor={skyBottom} />
            </linearGradient>
            <radialGradient id="ef-sun-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35 * phase} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Atmospheric backdrop */}
          <rect x="0" y="0" width={W} height={H} fill="url(#ef-sky)" />
          {phase > 0.04 && (
            <circle cx={NODES.pv.x} cy={NODES.pv.y} r={90} fill="url(#ef-sun-glow)" />
          )}

          {/* Edges: stable mount, value drives width/opacity (fades, never pops). */}
          {edges.map((e) => {
            const d = nodePath(e.from, e.to);
            const w = strokeWidth(e.value);
            // Fade the whole edge in/out smoothly as throughput crosses ~0.
            const flowOpacity = smoothstep(0.04, 0.4, e.value);
            return (
              <g
                key={e.id}
                style={{ opacity: flowOpacity, transition: "opacity 200ms ease-out" }}
              >
                <path
                  d={d}
                  fill="none"
                  stroke={e.color}
                  strokeOpacity={0.22}
                  strokeWidth={w}
                  strokeLinecap="round"
                  style={{ transition: "stroke-width 200ms ease-out" }}
                />
                {/* Particles mount once with a constant path + dur, so SMIL runs
                    uninterrupted; only their size reflects the live flow. */}
                {[0, 0.5].map((begin) => (
                  <circle key={begin} r={w * 0.6 + 1} fill={e.color} className="ef-particle">
                    <animateMotion
                      dur={`${PARTICLE_DUR}s`}
                      begin={`${begin * PARTICLE_DUR}s`}
                      repeatCount="indefinite"
                      path={d}
                    />
                  </circle>
                ))}
              </g>
            );
          })}

          {/* Nodes */}
          {visibleNodes.map((key) => {
            const n = NODES[key];
            const flow = nodeFlow[key];
            const active = flow > 0.05;
            const signed =
              key === "grid"
                ? (current?.gridImport ?? 0) - (current?.gridExport ?? 0)
                : key === "battery"
                  ? (current?.batteryDischarge ?? 0) - (current?.batteryCharge ?? 0)
                  : flow;
            const valueColor =
              key === "grid"
                ? signed > 0.05
                  ? "var(--destructive)"
                  : signed < -0.05
                    ? "var(--brand)"
                    : "var(--muted-foreground)"
                : key === "battery"
                  ? signed > 0.05
                    ? "var(--brand)"
                    : signed < -0.05
                      ? "var(--primary)"
                      : "var(--muted-foreground)"
                  : active
                    ? "var(--foreground)"
                    : "var(--muted-foreground)";

            const activeOpacity = smoothstep(0.04, 0.4, flow);
            const r = n.r ?? NODE_R;
            const small = r < NODE_R;
            const isBattery = key === "battery";
            return (
              <g
                key={key}
                style={{
                  opacity: lerp(0.5, 1, activeOpacity),
                  transition: "opacity 200ms ease-out",
                }}
              >
                {/* Active glow ring fades with throughput. */}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r + 4}
                  fill="none"
                  stroke={n.color}
                  strokeOpacity={0.18 * activeOpacity}
                  strokeWidth={Math.min(8, 3 + flow * 0.7)}
                  style={{ transition: "stroke-width 200ms ease-out" }}
                />

                {/* Filled disc */}
                <circle cx={n.x} cy={n.y} r={r} fill="var(--card)" />

                {isBattery && current ? (
                  /* Battery: progress donut (track + SoC arc) doubles as border. */
                  <BatterySoc cx={n.x} cy={n.y} r={r} pct={current.soc} />
                ) : (
                  /* Other nodes: single thin border. */
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r}
                    fill="none"
                    stroke={active ? n.color : "var(--border)"}
                    strokeOpacity={active ? 0.55 : 1}
                    strokeWidth={1.5}
                  />
                )}

                <NodeIcon
                  icon={
                    isBattery
                      ? (current?.batteryCharge ?? 0) > 0.05
                        ? BatteryCharging
                        : Battery
                      : n.icon
                  }
                  x={n.x}
                  y={n.y - (small ? 5 : 6)}
                  color={active ? n.color : "var(--muted-foreground)"}
                  size={small ? 16 : 20}
                />

                {/* Live value */}
                <text
                  x={n.x}
                  y={n.y + (small ? 14 : 17)}
                  textAnchor="middle"
                  fontSize={small ? 10 : 11}
                  fontWeight={600}
                  fill={valueColor}
                  fontFamily="var(--font-mono)"
                >
                  {`${!isBattery && signed < -0.05 ? "−" : ""}${Math.abs(signed).toFixed(1)} kW`}
                </text>

                {/* Label */}
                <text
                  x={n.x}
                  y={n.y + r + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--muted-foreground)"
                  fontWeight={500}
                >
                  {n.label}
                  {isBattery && current ? ` · ${current.soc.toFixed(0)}%` : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Day selector, surfaced separately so it can live next to the section heading.
export function EnergyDayPicker({ timeline }: { timeline: EnergyTimeline }) {
  const { activeDay, setDay, days } = timeline;
  if (!activeDay) return null;

  const activeDate = parse(activeDay, "yyyy-MM-dd", new Date());
  const minDate = days.data?.min
    ? parse(days.data.min, "yyyy-MM-dd", new Date())
    : undefined;
  const maxDate = days.data?.max
    ? parse(days.data.max, "yyyy-MM-dd", new Date())
    : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarDays />
          {format(activeDate, "EEE, d MMM yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={activeDate}
          defaultMonth={activeDate}
          startMonth={minDate}
          endMonth={maxDate}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          onSelect={(d) => d && setDay(format(d, "yyyy-MM-dd"))}
        />
      </PopoverContent>
    </Popover>
  );
}

// Full-width timeline: scrubbable day/night bar with sunrise/sunset times under
// their icons, and playback + speed controls to its right. Shares the diagram's
// live state via the timeline hook.
export function EnergyTimelineBar({ timeline }: { timeline: EnergyTimeline }) {
  const {
    steps,
    progress,
    setProgress,
    playing,
    setPlaying,
    speed,
    setSpeed,
    sun,
    pct,
    scrubTo,
  } = timeline;

  const clock = formatMinutes(progress);

  if (steps.length === 0) {
    return <Skeleton className="h-8 w-full rounded-lg" />;
  }

  return (
    <div className="flex flex-wrap items-start gap-4 px-5 py-4 sm:flex-nowrap">
      {/* Bar + sunrise/sunset labels beneath the markers. */}
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          aria-label="Time of day"
          aria-valuemin={0}
          aria-valuemax={steps.length - 1}
          aria-valuenow={Math.round(progress)}
          aria-valuetext={clock}
          tabIndex={0}
          onPointerDown={(e) => {
            if (e.currentTarget.hasPointerCapture?.(e.pointerId) === false) {
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* synthetic events lack a live pointer id */
              }
            }
            scrubTo(e.clientX, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) scrubTo(e.clientX, e.currentTarget);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              setPlaying(false);
              setProgress((p) => Math.max(0, Math.round(p) - 1));
            } else if (e.key === "ArrowRight") {
              setPlaying(false);
              setProgress((p) => Math.min(steps.length - 1, Math.round(p) + 1));
            }
          }}
          className="group relative h-8 w-full cursor-pointer touch-none overflow-hidden rounded-lg border border-border select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {/* Day/night gradient */}
          <div
            className="absolute inset-0"
            style={{
              background: sun
                ? `linear-gradient(to right,
                    color-mix(in oklch, oklch(0.45 0.09 255) 14%, var(--card)) 0%,
                    color-mix(in oklch, oklch(0.45 0.09 255) 14%, var(--card)) ${pct(sun.riseIdx)}%,
                    color-mix(in oklch, var(--brand) 26%, var(--card)) ${(pct(sun.riseIdx) + pct(sun.setIdx)) / 2}%,
                    color-mix(in oklch, oklch(0.45 0.09 255) 14%, var(--card)) ${pct(sun.setIdx)}%,
                    color-mix(in oklch, oklch(0.45 0.09 255) 14%, var(--card)) 100%)`
                : "var(--card)",
            }}
          />
          {/* Sun marker lines + icons */}
          {sun &&
            (
              [
                { idx: sun.riseIdx, Icon: Sunrise },
                { idx: sun.setIdx, Icon: Sunset },
              ] as const
            ).map(({ idx, Icon }, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex items-center"
                style={{ left: `${pct(idx)}%` }}
              >
                <div className="absolute h-full w-px bg-foreground/15" />
                <Icon
                  className="absolute -translate-x-1/2 text-foreground/55"
                  size={13}
                  strokeWidth={2}
                />
              </div>
            ))}
          {/* Current-time cursor */}
          <div
            className="absolute top-0 bottom-0 z-10 w-0.5 bg-foreground shadow-[0_0_6px_var(--foreground)]"
            style={{ left: `${pct(progress)}%` }}
          >
            <div className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-[var(--card)]" />
          </div>
        </div>

        {/* Sunrise/sunset times aligned under their icons. */}
        {sun && (
          <div className="relative mt-1.5 h-4">
            {(
              [
                { idx: sun.riseIdx, time: sun.riseTime },
                { idx: sun.setIdx, time: sun.setTime },
              ] as const
            ).map(({ idx, time }, i) => (
              <span
                key={i}
                className="absolute -translate-x-1/2 text-[11px] text-muted-foreground tabular-nums"
                style={{ left: `${pct(idx)}%` }}
              >
                {time}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Playback + speed controls — to the right of the bar, height-matched. */}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause /> : <Play />}
        </Button>

        <div className="flex h-8 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={`h-full rounded-md px-2.5 text-xs font-medium tabular-nums transition-colors ${
                speed === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
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
  // Lucide renders an <svg>; nest it and position via x/y attributes.
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
  const color =
    pct > 60 ? "var(--brand)" : pct > 25 ? "var(--primary)" : "var(--destructive)";
  return (
    <>
      {/* Track: the unfilled remainder of the ring. */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth={2.5}
      />
      {/* SoC arc on top — this is the battery's only border. */}
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
        style={{ transition: "stroke-dasharray 200ms ease-out" }}
      />
    </>
  );
}
