"use client";

import Image from "next/image";
import Link from "next/link";
import { HouseholdSelector } from "@/components/household-selector";
import { ThemeToggle } from "@/components/theme-toggle";

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
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Enpal Pulse"
            width={36}
            height={36}
            className="size-9 rounded-lg"
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">
              Enpal Pulse
            </span>
            <span className="text-xs text-muted-foreground">
              Smart Energy Companion
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-1.5">
          {!isLoading && households.length > 0 && (
            <HouseholdSelector
              households={households}
              activeId={activeId}
              onSelect={onSelect}
            />
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
