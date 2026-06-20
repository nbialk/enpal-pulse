"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { YearView } from "@/components/year-view";

export default function YearPage() {
  return (
    <Suspense>
      <AppShell>{(activeId) => <YearView householdId={activeId} />}</AppShell>
    </Suspense>
  );
}
