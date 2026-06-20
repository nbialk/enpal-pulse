"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { InsightCard } from "@/components/insight-card";

export default function DashboardPage() {
  return (
    <Suspense>
      <AppShell>
        {(activeId) => (
          <>
            <InsightCard householdId={activeId} />
            <Dashboard householdId={activeId} />
          </>
        )}
      </AppShell>
    </Suspense>
  );
}
