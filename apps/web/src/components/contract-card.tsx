"use client";

import { trpc } from "@/lib/trpc/client";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

export function ContractCard({ householdId }: { householdId: string }) {
  const household = trpc.households.byId.useQuery(householdId);
  const contract = household.data?.contract;

  if (!household.data) {
    return <div className="h-32 animate-pulse rounded bg-muted" />;
  }

  if (!contract) {
    return (
      <p className="text-sm text-muted-foreground">
        Kein Vertrag hinterlegt.
      </p>
    );
  }

  const isDynamic = contract.pricingModel.toLowerCase().includes("dynamic");

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Field label="Anbieter" value={contract.provider} />
      <Field
        label="Tarifmodell"
        value={isDynamic ? "Dynamisch (Börsenpreis)" : "Festpreis"}
      />
      <Field label="Läuft bis" value={fmtDate(contract.contractEnd)} />
      <Field
        label="Kündigungsfrist"
        value={`${contract.noticePeriodWeeks} Wochen`}
      />
    </div>
  );
}
