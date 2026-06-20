"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Pause, Play, Sunrise, Sunset } from "lucide-react";
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

// SVG canvas is 600 x 360. Node centers.
const NODES = {
  pv: { x: 300, y: 56, label: "Solar", emoji: "☀️", color: "var(--brand)" },
  grid: { x: 80, y: 190, label: "Grid", emoji: "⚡", color: "var(--destructive)" },
  battery: { x: 520, y: 190, label: "Battery", emoji: "🔋", color: "var(--primary)" },
  house: { x: 300, y: 190, label: "House", emoji: "🏠", color: "var(--foreground)" },
  heatpump: { x: 200, y: 320, label: "Heat pump", emoji: "♨️", color: "var(--chart-2)" },
  ev: { x: 400, y: 320, label: "EV", emoji: "🚗", color: "var(--chart-2)" },
} as const;

type NodeKey = keyof typeof NODES;

type Edge = {
  id: string;
  from: NodeKey;
  to: NodeKey;
  value: number; // kW, always >= 0; direction encoded by from->to
  color: string;
};

const SPEEDS = [1, 4, 8] as const;
const STEP_MS = 700; // ms per quarter-hour at 1x
const PV_ON = 0.05; // kW threshold treated as "sun is up"

function nodePath(from: NodeKey, to: NodeKey) {
  const a = NODES[from];
  const b = NODES[to];
  // gentle curve via quadratic control at the midpoint, nudged perpendicular
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nudge = 18;
  const cx = mx + (-dy / len) * nudge;
  const cy = my + (dx / len) * nudge;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

function strokeWidth(kw: number) {
  // 0..~10 kW -> 1.5..7 px
  return Math.max(1.5, Math.min(7, 1.5 + kw * 0.9));
}

function buildEdges(s: Step, hasHeatPump: boolean, hasEv: boolean): Edge[] {
  const edges: Edge[] = [];
  const add = (id: string, from: NodeKey, to: NodeKey, value: number, color: string) => {
    if (value > 0.05) edges.push({ id, from, to, value, color });
  };

  // Solar splits into self-use, battery charging, and grid export.
  const pvToBattery = Math.min(s.pv, s.batteryCharge);
  const pvToGrid = Math.min(Math.max(s.pv - pvToBattery, 0), s.gridExport);
  const pvToHouse = Math.max(s.pv - pvToBattery - pvToGrid, 0);

  add("pv-house", "pv", "house", pvToHouse, NODES.pv.color);
  add("pv-battery", "pv", "battery", pvToBattery, NODES.pv.color);
  add("pv-grid", "pv", "grid", pvToGrid, NODES.pv.color);

  // House is supplied by grid import and battery discharge as well.
  add("grid-house", "grid", "house", s.gridImport, NODES.grid.color);
  add("battery-house", "battery", "house", s.batteryDischarge, NODES.battery.color);

  // House feeds heat pump and EV (subsets of total load).
  if (hasHeatPump) add("house-hp", "house", "heatpump", s.heatpump, NODES.heatpump.color);
  if (hasEv) add("house-ev", "house", "ev", s.ev, NODES.ev.color);

  return edges;
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

  const steps = useMemo(
    () => (intraday.data ?? []) as Step[],
    [intraday.data],
  );

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  // Reset to start when the day changes (render-time state adjustment).
  const prevDayRef = useRef(activeDay);
  if (prevDayRef.current !== activeDay) {
    prevDayRef.current = activeDay;
    setIndex(0);
  }

  // Animation loop advancing the time index.
  useEffect(() => {
    if (!playing || steps.length === 0) return;
    const tick = (now: number) => {
      if (!lastRef.current) lastRef.current = now;
      const elapsed = now - lastRef.current;
      if (elapsed >= STEP_MS / speed) {
        lastRef.current = now;
        setIndex((i) => (i + 1) % steps.length);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRef.current = 0;
    };
  }, [playing, speed, steps.length]);

  const current = steps[index];

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

  const pct = (i: number) =>
    steps.length > 1 ? (i / (steps.length - 1)) * 100 : 0;

  const scrubTo = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    setPlaying(false);
    setIndex(Math.round(ratio * (steps.length - 1)));
  };

  if (!activeDay || !intraday.data) {
    return <div className="h-[420px] animate-pulse rounded bg-muted" />;
  }

  const activeDate = parse(activeDay, "yyyy-MM-dd", new Date());
  const minDate = days.data?.min
    ? parse(days.data.min, "yyyy-MM-dd", new Date())
    : undefined;
  const maxDate = days.data?.max
    ? parse(days.data.max, "yyyy-MM-dd", new Date())
    : undefined;

  return (
    <div>
      {/* Control row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <CalendarDays />
              {format(activeDate, "EEE, d MMM yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
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

        <span className="ml-auto font-mono text-base font-medium tabular-nums text-foreground">
          {current?.time ?? "--:--"}
        </span>

        <div className="flex gap-0.5 rounded-md border border-border p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`rounded px-1.5 py-0.5 text-xs tabular-nums transition-colors ${
                speed === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
      </div>

      {/* Sunrise/sunset timeframe — scrubbable */}
      <div className="mb-4">
        <div
          role="slider"
          aria-label="Time of day"
          aria-valuemin={0}
          aria-valuemax={steps.length - 1}
          aria-valuenow={index}
          tabIndex={0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubTo(e.clientX, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) scrubTo(e.clientX, e.currentTarget);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              setPlaying(false);
              setIndex((i) => Math.max(0, i - 1));
            } else if (e.key === "ArrowRight") {
              setPlaying(false);
              setIndex((i) => Math.min(steps.length - 1, i + 1));
            }
          }}
          className="relative h-7 cursor-pointer touch-none overflow-hidden rounded-md border border-border select-none"
        >
          {/* Day/night gradient background */}
          <div
            className="absolute inset-0"
            style={{
              background: sun
                ? `linear-gradient(to right,
                    color-mix(in oklch, var(--foreground) 12%, var(--card)) 0%,
                    color-mix(in oklch, var(--foreground) 12%, var(--card)) ${pct(sun.riseIdx)}%,
                    color-mix(in oklch, var(--brand) 22%, var(--card)) ${(pct(sun.riseIdx) + pct(sun.setIdx)) / 2}%,
                    color-mix(in oklch, var(--foreground) 12%, var(--card)) ${pct(sun.setIdx)}%,
                    color-mix(in oklch, var(--foreground) 12%, var(--card)) 100%)`
                : "var(--card)",
            }}
          />
          {/* Sunrise marker */}
          {sun && (
            <div
              className="absolute top-0 bottom-0 flex items-center"
              style={{ left: `${pct(sun.riseIdx)}%` }}
            >
              <div className="absolute h-full w-px bg-primary/40" />
              <Sunrise className="absolute -translate-x-1/2 text-primary" size={13} />
            </div>
          )}
          {/* Sunset marker */}
          {sun && (
            <div
              className="absolute top-0 bottom-0 flex items-center"
              style={{ left: `${pct(sun.setIdx)}%` }}
            >
              <div className="absolute h-full w-px bg-primary/40" />
              <Sunset className="absolute -translate-x-1/2 text-primary" size={13} />
            </div>
          )}
          {/* Current-time cursor */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-foreground"
            style={{ left: `${pct(index)}%` }}
          >
            <div className="absolute -top-px -left-[3px] size-2 rounded-full bg-foreground" />
          </div>
        </div>
        {sun && (
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
            <span className="flex items-center gap-1">
              <Sunrise size={11} /> {sun.riseTime}
            </span>
            <span className="flex items-center gap-1">
              {sun.setTime} <Sunset size={11} />
            </span>
          </div>
        )}
      </div>

      <svg
        viewBox="0 0 600 380"
        className="w-full"
        role="img"
        aria-label="Energy flow diagram"
      >
        {/* Edges */}
        {edges.map((e) => {
          const d = nodePath(e.from, e.to);
          const w = strokeWidth(e.value);
          // Faster particles for stronger flows.
          const dur = Math.max(0.8, 2.4 - e.value * 0.18);
          return (
            <g key={e.id}>
              <path
                d={d}
                fill="none"
                stroke={e.color}
                strokeOpacity={0.25}
                strokeWidth={w}
                strokeLinecap="round"
              />
              {[0, 0.5].map((begin) => (
                <circle key={begin} r={w * 0.7 + 1} fill={e.color}>
                  <animateMotion
                    dur={`${dur}s`}
                    begin={`${begin * dur}s`}
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
          const value =
            key === "pv"
              ? current?.pv
              : key === "grid"
                ? (current?.gridImport ?? 0) - (current?.gridExport ?? 0)
                : key === "battery"
                  ? (current?.batteryDischarge ?? 0) - (current?.batteryCharge ?? 0)
                  : key === "house"
                    ? current?.consumption
                    : key === "heatpump"
                      ? current?.heatpump
                      : current?.ev;
          return (
            <g key={key}>
              <circle
                cx={n.x}
                cy={n.y}
                r={34}
                fill="var(--card)"
                stroke="var(--border)"
                strokeWidth={1.5}
              />
              <text
                x={n.x}
                y={n.y - 4}
                textAnchor="middle"
                fontSize={22}
                dominantBaseline="middle"
              >
                {n.emoji}
              </text>
              <text
                x={n.x}
                y={n.y + 16}
                textAnchor="middle"
                fontSize={9}
                fill="var(--muted-foreground)"
                fontFamily="var(--font-mono)"
              >
                {value != null ? `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(1)} kW` : ""}
              </text>
              <text
                x={n.x}
                y={n.y + 50}
                textAnchor="middle"
                fontSize={11}
                fill="var(--foreground)"
                fontWeight={500}
              >
                {n.label}
              </text>
              {key === "battery" && (
                <text
                  x={n.x}
                  y={n.y + 64}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--muted-foreground)"
                  fontFamily="var(--font-mono)"
                >
                  {current ? `${current.soc.toFixed(0)}%` : ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
