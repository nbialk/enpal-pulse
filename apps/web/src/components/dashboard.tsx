"use client";

import { useState } from "react";
import { Section } from "@/components/ui/section";
import { HeroSavings } from "@/components/hero-savings";
import { EnergyFlow, type LiveSnapshot } from "@/components/charts/energy-flow";
import { HouseholdInsights } from "@/components/household-insights";

// Keeps the timeline-cursor live state local to this subtree, so the
// per-frame updates from EnergyFlow don't re-render the whole dashboard.
function LiveSection({ householdId }: { householdId: string }) {
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  return (
    <div className="grid gap-px bg-border lg:grid-cols-[3fr_2fr]">
      <div className="bg-card">
        <EnergyFlow householdId={householdId} onLiveChange={setLive} />
      </div>
      <div className="bg-card">
        <HouseholdInsights live={live} />
      </div>
    </div>
  );
}

export function Dashboard({ householdId }: { householdId: string }) {
  return (
    <div className="space-y-6">
      {/* Question 1 — the star: Am I saving money? + live nudge */}
      <HeroSavings householdId={householdId} />

      {/* Question 2 — what's happening right now? */}
      <Section question="Was passiert gerade in meinem Zuhause?" className="p-0">
        <LiveSection householdId={householdId} />
      </Section>
    </div>
  );
}
