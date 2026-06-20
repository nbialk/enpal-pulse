"use client";

import { trpc } from "@/lib/trpc/client";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", {
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
        No contract on file.
      </p>
    );
  }

  const isDynamic = contract.pricingModel.toLowerCase().includes("dynamic");

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Field label="Provider" value={contract.provider} />
      <Field
        label="Tariff model"
        value={isDynamic ? "Dynamic (spot price)" : "Fixed price"}
      />
      <Field label="Runs until" value={fmtDate(contract.contractEnd)} />
      <Field
        label="Notice period"
        value={`${contract.noticePeriodWeeks} weeks`}
      />
    </div>
  );
}
