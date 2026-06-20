"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Stat } from "@/components/ui/stat";
import { Section } from "@/components/ui/section";
import { ContractCard } from "@/components/contract-card";
import { BillsChart } from "@/components/charts/bills-chart";
import {
  EnergyChart,
  EnergyMonthSelect,
  ENERGY_DEFAULT_MONTH,
} from "@/components/charts/energy-chart";

export function YearView({ householdId }: { householdId: string }) {
  const household = trpc.households.byId.useQuery(householdId);
  const bills = trpc.bills.byHousehold.useQuery({ householdId });
  const [energyMonth, setEnergyMonth] = useState(ENERGY_DEFAULT_MONTH);

  const avgSelfSufficiency = bills.data?.length
    ? bills.data.reduce((s, b) => s + b.selfSufficiencyPct, 0) / bills.data.length
    : 0;
  const yearPv = bills.data?.reduce((s, b) => s + b.pvProductionKwh, 0) ?? 0;
  const yearConsumption =
    bills.data?.reduce((s, b) => s + b.consumptionKwh, 0) ?? 0;

  return (
    <div className="space-y-6">
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

      {/* Question 4 — when should I use energy? */}
      <Section
        question="Wann sollte ich Energie nutzen?"
        answer="Tagesverlauf von Solarproduktion, Verbrauch und Netzbezug."
        action={
          <EnergyMonthSelect month={energyMonth} onMonthChange={setEnergyMonth} />
        }
      >
        <EnergyChart householdId={householdId} month={energyMonth} />
      </Section>

      {/* Question 5 — is my contract still a good deal? */}
      <Section
        question="Ist mein Vertrag noch gut?"
        answer="Die Eckdaten deines Tarifs auf einen Blick."
      >
        <ContractCard householdId={householdId} />
      </Section>
    </div>
  );
}
