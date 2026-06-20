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
          label="Self-sufficiency"
          value={avgSelfSufficiency.toFixed(0)}
          unit="%"
          hint="Share of own power"
        />
        <Stat
          label="Solar production"
          value={yearPv.toFixed(0)}
          unit="kWh"
          hint="2025"
        />
        <Stat
          label="Consumption"
          value={yearConsumption.toFixed(0)}
          unit="kWh"
          hint="2025"
        />
        <Stat
          label="Battery"
          value={
            household.data?.batteryKwh
              ? `${household.data.batteryKwh}`
              : "none"
          }
          unit={household.data?.batteryKwh ? "kWh" : undefined}
        />
      </div>

      {/* Question 3 — why was my bill what it was? */}
      <Section
        question="Why was my bill what it was?"
        answer="Monthly costs and how much power you covered yourself."
      >
        <BillsChart householdId={householdId} />
      </Section>

      {/* Question 4 — when should I use energy? */}
      <Section
        question="When should I use energy?"
        answer="Daily curve of solar production, consumption and grid import."
        action={
          <EnergyMonthSelect month={energyMonth} onMonthChange={setEnergyMonth} />
        }
      >
        <EnergyChart householdId={householdId} month={energyMonth} />
      </Section>

      {/* Question 5 — is my contract still a good deal? */}
      <Section
        question="Is my contract still a good deal?"
        answer="The key facts of your tariff at a glance."
      >
        <ContractCard householdId={householdId} />
      </Section>
    </div>
  );
}
