"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { TopNav } from "@/components/top-nav";

export function AppShell({
  children,
}: {
  children: (activeId: string) => React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const households = trpc.households.list.useQuery();

  const requested = searchParams.get("household");
  const activeId =
    (requested &&
      households.data?.some((h) => h.householdId === requested) &&
      requested) ||
    households.data?.[0]?.householdId ||
    null;

  const onSelect = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("household", id);
    router.replace(`?${params.toString()}`);
  };

  return (
    <>
      <TopNav
        households={households.data ?? []}
        activeId={activeId}
        onSelect={onSelect}
        isLoading={households.isLoading}
      />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
        {households.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading households…</p>
        ) : (
          activeId && children(activeId)
        )}
      </main>
    </>
  );
}
