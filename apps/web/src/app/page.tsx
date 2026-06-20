"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { TopNav } from "@/components/top-nav";
import { Dashboard } from "@/components/dashboard";

export default function Home() {
  const households = trpc.households.list.useQuery();
  const [selected, setSelected] = useState<string | null>(null);

  const activeId = selected ?? households.data?.[0]?.householdId ?? null;

  return (
    <>
      <TopNav
        households={households.data ?? []}
        activeId={activeId}
        onSelect={setSelected}
        isLoading={households.isLoading}
      />
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        {households.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading households…</p>
        ) : (
          activeId && <Dashboard householdId={activeId} />
        )}
      </main>
    </>
  );
}
