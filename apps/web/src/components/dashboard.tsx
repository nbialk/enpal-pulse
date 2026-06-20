"use client";

import { trpc } from "@/lib/trpc/client";
import { Stat } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HeroSavings } from "@/components/hero-savings";
import { ContractCard } from "@/components/contract-card";
import { AICompanion } from "@/components/ai-companion";
import { BillsChart } from "@/components/charts/bills-chart";
import { EnergyChart } from "@/components/charts/energy-chart";
import { EnergyFlow } from "@/components/charts/energy-flow";
import { HouseholdInsights } from "@/components/household-insights";
import { InsightsFeed } from "@/components/insights-feed";

export function Dashboard({ householdId }: { householdId: string }) {
  const household = trpc.households.byId.useQuery(householdId);
  const bills = trpc.bills.byHousehold.useQuery({ householdId });

  const avgSelfSufficiency = bills.data?.length
    ? bills.data.reduce((s, b) => s + b.selfSufficiencyPct, 0) / bills.data.length
    : 0;
  const yearPv = bills.data?.reduce((s, b) => s + b.pvProductionKwh, 0) ?? 0;
  const yearConsumption =
    bills.data?.reduce((s, b) => s + b.consumptionKwh, 0) ?? 0;

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Übersicht</TabsTrigger>
        <TabsTrigger value="year">Jahr</TabsTrigger>
      </TabsList>

      {/* Overview — what's relevant right now */}
      <TabsContent value="overview" className="space-y-6">
        {/* Question 1 — the star: Am I saving money? + live nudge */}
        <HeroSavings householdId={householdId} />

        {/* Question 2 — what's happening right now? */}
        <Section
          question="Was passiert gerade in meinem Zuhause?"
          answer="Solar, Batterie, Netz und Verbraucher in Echtzeit."
          className="p-0"
        >
          <div className="grid gap-px bg-border lg:grid-cols-[2fr_1fr]">
            <div className="bg-card">
              <EnergyFlow householdId={householdId} />
            </div>
            <div className="bg-card">
              <HouseholdInsights householdId={householdId} />
            </div>
          </div>
        </Section>

        {/* Question 4 — when should I use energy? */}
        <Section
          question="Wann sollte ich Energie nutzen?"
          answer="Tagesverlauf von Solarproduktion, Verbrauch und Netzbezug."
        >
          <EnergyChart householdId={householdId} />
        </Section>

        {/* Conversational layer (slot) */}
        <AICompanion />

        {/* Proactive insights & nudges */}
        <Section
          question="Worauf solltest du achten?"
          answer="Auffälligkeiten und Empfehlungen aus deinen Daten."
        >
          <InsightsFeed householdId={householdId} />
        </Section>
      </TabsContent>

      {/* Year — annual recap and contract context */}
      <TabsContent value="year" className="space-y-6">
        {/* Supporting context at a glance */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Eigenversorgung"
            value={avgSelfSufficiency.toFixed(0)}
            unit="%"
            hint="Anteil Eigenstrom"
          />
          <Stat
            label="Solarproduktion"
            value={yearPv.toFixed(0)}
            unit="kWh"
            hint="2025"
          />
          <Stat
            label="Verbrauch"
            value={yearConsumption.toFixed(0)}
            unit="kWh"
            hint="2025"
          />
          <Stat
            label="Batterie"
            value={
              household.data?.batteryKwh
                ? `${household.data.batteryKwh}`
                : "keine"
            }
            unit={household.data?.batteryKwh ? "kWh" : undefined}
          />
        </div>

        {/* Question 3 — why was my bill what it was? */}
        <Section
          question="Warum war meine Rechnung so?"
          answer="Monatliche Kosten und wie viel Strom du selbst gedeckt hast."
        >
          <BillsChart householdId={householdId} />
        </Section>

        {/* Question 5 — is my contract still a good deal? */}
        <Section
          question="Ist mein Vertrag noch gut?"
          answer="Die Eckdaten deines Tarifs auf einen Blick."
        >
          <ContractCard householdId={householdId} />
        </Section>
      </TabsContent>
    </Tabs>
  );
}
