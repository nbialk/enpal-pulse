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

// SVG canvas. Compact, balanced radial composition around the house.
const W = 560;
const H = 300;

type NodeDef = {
  x: number;
  y: number;
  label: string;
  icon: LucideIcon;
  color: string;
};

const NODES: Record<string, NodeDef> = {
  pv: { x: 280, y: 52, label: "Solar", icon: Sun, color: "var(--brand)" },
  grid: { x: 80, y: 168, label: "Grid", icon: Zap, color: "var(--destructive)" },
  battery: { x: 480, y: 168, label: "Battery", icon: Battery, color: "var(--primary)" },
  house: { x: 280, y: 168, label: "House", icon: Home, color: "var(--foreground)" },
  heatpump: { x: 188, y: 268, label: "Heat pump", icon: Thermometer, color: "var(--chart-2)" },
  ev: { x: 372, y: 268, label: "EV", icon: Car, color: "var(--chart-2)" },
};

type NodeKey = keyof typeof NODES;

type Edge = {
  id: string;
  from: NodeKey;
  to: NodeKey;
  value: number; // kW, always >= 0; direction encoded by from->to
  color: string;
};

const SPEEDS = [1, 4, 8] as const;
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

// Continuous clock from fractional step progress (15-min steps).
function formatMinutes(progress: number) {
  const totalMin = Math.round(progress * 15);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nodePath(from: NodeKey, to: NodeKey) {
  const a = NODES[from];
  const b = NODES[to];
  // Trim the path to start/end at the node edge, not the center.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ax = a.x + ux * NODE_R;
  const ay = a.y + uy * NODE_R;
  const bx = b.x - ux * NODE_R;
  const by = b.y - uy * NODE_R;
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

export function EnergyFlow({ householdId }: { householdId: string }) {
  const household = trpc.households.byId.useQuery(householdId);
  const days = trpc.energy.availableDays.useQuery({ householdId });

  const [day, setDay] = useState<string | null>(null);
  const activeDay = day ?? days.data?.defaultDay ?? null;

  const intraday = trpc.energy.intraday.useQuery(
    { householdId, day: activeDay ?? "" },
    { enabled: !!activeDay },
  );

  const steps = useMemo(() => (intraday.data ?? []) as Step[], [intraday.data]);

  // Continuous fractional position across steps (e.g. 12.6 = 60% to step 13).
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  // Reset to start when the day changes (render-time state adjustment).
  const prevDayRef = useRef(activeDay);
  if (prevDayRef.current !== activeDay) {
    prevDayRef.current = activeDay;
    setProgress(0);
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

  const pct = (i: number) => (steps.length > 1 ? (i / (steps.length - 1)) * 100 : 0);

  const scrubTo = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    setPlaying(false);
    setProgress(ratio * (steps.length - 1));
  };

  if (!activeDay || !intraday.data) {
    return <div className="h-[520px] animate-pulse rounded-xl bg-muted" />;
  }

  const activeDate = parse(activeDay, "yyyy-MM-dd", new Date());
  const minDate = days.data?.min ? parse(days.data.min, "yyyy-MM-dd", new Date()) : undefined;
  const maxDate = days.data?.max ? parse(days.data.max, "yyyy-MM-dd", new Date()) : undefined;

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
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Live energy flow</h2>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
            <span className="font-mono">{clock}</span>
            <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
              {isNight ? "Night" : phase > 0.7 ? "Midday sun" : "Daylight"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
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
        </div>
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
                  r={NODE_R + 4}
                  fill="none"
                  stroke={n.color}
                  strokeOpacity={0.18 * activeOpacity}
                  strokeWidth={Math.min(8, 3 + flow * 0.7)}
                  style={{ transition: "stroke-width 200ms ease-out" }}
                />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={NODE_R}
                  fill="var(--card)"
                  stroke={active ? n.color : "var(--border)"}
                  strokeOpacity={active ? 0.55 : 1}
                  strokeWidth={1.5}
                />

                {/* Battery SoC arc */}
                {key === "battery" && current && (
                  <BatterySoc cx={n.x} cy={n.y} r={NODE_R - 3} pct={current.soc} />
                )}

                <NodeIcon
                  icon={
                    key === "battery"
                      ? (current?.batteryCharge ?? 0) > 0.05
                        ? BatteryCharging
                        : Battery
                      : n.icon
                  }
                  x={n.x}
                  y={n.y - 6}
                  color={active ? n.color : "var(--muted-foreground)"}
                />

                {/* Live value */}
                <text
                  x={n.x}
                  y={n.y + 17}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={valueColor}
                  fontFamily="var(--font-mono)"
                >
                  {`${signed < -0.05 ? "−" : ""}${Math.abs(signed).toFixed(1)} kW`}
                </text>

                {/* Label */}
                <text
                  x={n.x}
                  y={n.y + NODE_R + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--muted-foreground)"
                  fontWeight={500}
                >
                  {n.label}
                  {key === "battery" && current ? ` · ${current.soc.toFixed(0)}%` : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Timeline: sunrise → sunset, scrubbable */}
      <div className="px-5 pb-5">
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
          className="group relative h-8 cursor-pointer touch-none overflow-hidden rounded-lg border border-border select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
          {/* Sun markers */}
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

        {/* Controls + sun times */}
        <div className="mt-2.5 flex items-center gap-3">
          <Button
            variant="default"
            size="icon-sm"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause /> : <Play />}
          </Button>

          <div className="flex gap-0.5 rounded-md border border-border p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`rounded px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                  speed === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}×
              </button>
            ))}
          </div>

          {sun && (
            <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
              <span className="flex items-center gap-1">
                <Sunrise size={13} /> {sun.riseTime}
              </span>
              <span className="flex items-center gap-1">
                <Sunset size={13} /> {sun.setTime}
              </span>
            </div>
          )}
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
}: {
  icon: LucideIcon;
  x: number;
  y: number;
  color: string;
}) {
  const size = 20;
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
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeOpacity={0.6}
      strokeWidth={3}
      strokeLinecap="round"
      strokeDasharray={`${frac * circumference} ${circumference}`}
      transform={`rotate(-90 ${cx} ${cy})`}
    />
  );
}
