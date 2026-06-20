"use client";

type Household = {
  householdId: string;
  name: string;
  city: string;
  tariff: { name: string };
};

export function HouseholdSelector({
  households,
  activeId,
  onSelect,
}: {
  households: Household[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {households.map((h) => {
        const active = h.householdId === activeId;
        return (
          <button
            key={h.householdId}
            onClick={() => onSelect(h.householdId)}
            className={`rounded-lg border p-4 text-left transition-colors ${
              active
                ? "border-primary bg-card ring-1 ring-primary"
                : "border-border bg-card hover:border-primary/50"
            }`}
          >
            <div className="text-sm font-medium">{h.name}</div>
            <div className="text-xs text-muted-foreground">{h.city}</div>
            <div className="mt-2 text-xs text-muted-foreground">{h.tariff.name}</div>
          </button>
        );
      })}
    </div>
  );
}
