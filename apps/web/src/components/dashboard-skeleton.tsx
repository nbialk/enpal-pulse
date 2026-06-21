import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder for /dashboard. Mirrors the real layout (insight card +
 * live section with flow diagram, side panel, and timeline) so there is no
 * layout shift when the data arrives.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <InsightCardSkeleton />
      <LiveSectionSkeleton />
    </div>
  );
}

function InsightCardSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="size-3.5 rounded-full" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="flex gap-3.5 px-4 py-4">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      </div>
    </section>
  );
}

function LiveSectionSkeleton() {
  return (
    <section className="rounded-xl border border-border bg-card p-0">
      {/* Section header: question + day picker action. */}
      <div className="flex items-start justify-between gap-4 p-5">
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-8 w-44 shrink-0 rounded-md" />
      </div>

      <div className="flex flex-col gap-px bg-border">
        <div className="grid gap-px bg-border lg:grid-cols-[3fr_2fr]">
          <div className="bg-card">
            <FlowSkeleton />
          </div>
          <div className="bg-card">
            <SidePanelSkeleton />
          </div>
        </div>
        <div className="bg-card">
          <TimelineSkeleton />
        </div>
      </div>
    </section>
  );
}

function FlowSkeleton() {
  return (
    <div className="px-5 pt-5">
      {/* Clock + phase label */}
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-2 h-7 w-40" />

      {/* Abstracted radial node diagram. */}
      <div className="relative mt-2 aspect-[560/300] w-full">
        {/* Connecting lines behind the nodes. */}
        <div className="absolute left-1/2 top-[17%] h-[34%] w-px -translate-x-1/2 bg-border" />
        <div className="absolute left-[14%] right-[14%] top-[56%] h-px bg-border" />
        <div className="absolute left-[38%] top-[56%] h-[24%] w-px bg-border" />
        <div className="absolute right-[38%] top-[56%] h-[24%] w-px bg-border" />

        {/* Solar (top) */}
        <Node className="left-1/2 top-[17%]" />
        {/* Grid · House · Battery row */}
        <Node className="left-[14%] top-[56%]" />
        <Node className="left-1/2 top-[56%]" />
        <Node className="left-[86%] top-[56%]" />
        {/* Heat pump · EV */}
        <Node className="left-[38%] top-[81%]" small />
        <Node className="left-[62%] top-[81%]" small />
      </div>
    </div>
  );
}

/** A single circular node placeholder, centered on its anchor point. */
function Node({ className, small }: { className?: string; small?: boolean }) {
  return (
    <Skeleton
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
        small ? "size-9" : "size-12"
      } ${className}`}
    />
  );
}

function SidePanelSkeleton() {
  return (
    <div className="flex h-full flex-col gap-px bg-border">
      {/* Right now */}
      <div className="bg-card p-5">
        <div className="flex items-center gap-2">
          <Skeleton className="size-3.5 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="size-12 rounded-full" />
        </div>
      </div>

      {/* Daily balance */}
      <div className="flex flex-1 flex-col bg-card p-5">
        <Skeleton className="h-3 w-40" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-border p-2.5">
              <Skeleton className="size-3.5 rounded-sm" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-3 h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-wrap items-start gap-4 px-5 py-4 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="mt-1.5 flex justify-between">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-10" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}
