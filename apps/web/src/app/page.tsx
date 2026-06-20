"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { HouseholdSelector } from "@/components/household-selector";
import { Dashboard } from "@/components/dashboard";

export default function Home() {
  const households = trpc.households.list.useQuery();
  const [selected, setSelected] = useState<string | null>(null);

  const activeId = selected ?? households.data?.[0]?.householdId ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Enpal Track</h1>
        <p className="text-sm text-muted-foreground">
          Smart Energy Companion — 2025 household overview
        </p>
      </header>

      {households.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading households…</p>
      ) : (
        <>
          <HouseholdSelector
            households={households.data ?? []}
            activeId={activeId}
            onSelect={setSelected}
          />
          {activeId && <Dashboard householdId={activeId} />}
        </>
      )}
    </main>
  );
}
