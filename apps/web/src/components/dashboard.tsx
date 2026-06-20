"use client";

import { useState } from "react";
import { Section } from "@/components/ui/section";
import {
  EnergyDayPicker,
  EnergyFlow,
  EnergyTimelineBar,
  useEnergyTimeline,
  type LiveSnapshot,
} from "@/components/charts/energy-flow";
import { HouseholdInsights } from "@/components/household-insights";

// Keeps the timeline-cursor live state local to this subtree, so the
// per-frame updates from the timeline don't re-render the whole dashboard.
function LiveSection({ householdId }: { householdId: string }) {
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const timeline = useEnergyTimeline(householdId, setLive);
  return (
    <Section
      question="Was passiert gerade in meinem Zuhause?"
      action={<EnergyDayPicker timeline={timeline} />}
      className="p-0"
    >
      <div className="flex flex-col gap-px bg-border">
        <div className="grid gap-px bg-border lg:grid-cols-[3fr_2fr]">
          <div className="bg-card">
            <EnergyFlow timeline={timeline} />
          </div>
          <div className="bg-card">
            <HouseholdInsights live={live} />
          </div>
        </div>
        {/* Full-width timeline spanning both columns. */}
        <div className="bg-card">
          <EnergyTimelineBar timeline={timeline} />
        </div>
      </div>
    </Section>
  );
}

export function Dashboard({ householdId }: { householdId: string }) {
  return (
    <div className="space-y-6">
      <LiveSection householdId={householdId} />
    </div>
  );
}
