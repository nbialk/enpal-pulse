"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, Stat } from "@/components/ui/card";
import { BillsChart } from "@/components/charts/bills-chart";
import { EnergyChart } from "@/components/charts/energy-chart";
import { EnergyFlow } from "@/components/charts/energy-flow";
import { InsightsFeed } from "@/components/insights-feed";

export function Dashboard({ householdId }: { householdId: string }) {
  const household = trpc.households.byId.useQuery(householdId);
  const bills = trpc.bills.byHousehold.useQuery({ householdId });

  const yearBill = bills.data?.reduce((sum, b) => sum + b.totalBillEur, 0) ?? 0;
  const avgSelfSufficiency = bills.data?.length
    ? bills.data.reduce((s, b) => s + b.selfSufficiencyPct, 0) / bills.data.length
    : 0;
  const yearPv = bills.data?.reduce((s, b) => s + b.pvProductionKwh, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Annual bill 2025" value={yearBill.toFixed(0)} unit="€" />
        <Stat
          label="Avg self-sufficiency"
          value={avgSelfSufficiency.toFixed(0)}
          unit="%"
        />
        <Stat label="PV production" value={yearPv.toFixed(0)} unit="kWh" />
        <Stat
          label="Battery"
          value={
            household.data?.batteryKwh ? `${household.data.batteryKwh}` : "none"
          }
          unit={household.data?.batteryKwh ? "kWh" : undefined}
        />
      </div>

      <Card className="p-0">
        <EnergyFlow householdId={householdId} />
      </Card>

      <Card title="Monthly bills & self-sufficiency">
        <BillsChart householdId={householdId} />
      </Card>

      <Card title="Daily energy balance">
        <EnergyChart householdId={householdId} />
      </Card>

      <Card title="Insights & nudges">
        <InsightsFeed householdId={householdId} />
      </Card>
    </div>
  );
}
