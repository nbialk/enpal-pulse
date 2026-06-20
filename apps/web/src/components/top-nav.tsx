"use client";

import { HouseholdSelector } from "@/components/household-selector";

type Household = {
  householdId: string;
  name: string;
  city: string;
  tariff: { name: string; type: string };
};

export function TopNav({
  households,
  activeId,
  onSelect,
  isLoading,
}: {
  households: Household[];
  activeId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight">
            Enpal Track
          </span>
          <span className="text-xs text-muted-foreground">
            Smart Energy Companion
          </span>
        </div>
        {!isLoading && households.length > 0 && (
          <HouseholdSelector
            households={households}
            activeId={activeId}
            onSelect={onSelect}
          />
        )}
      </div>
    </header>
  );
}
