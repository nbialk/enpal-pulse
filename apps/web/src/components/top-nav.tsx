"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
  const pathname = usePathname();
  const query = activeId ? `?household=${activeId}` : "";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight">
            Enpal Track
          </span>
          <span className="text-xs text-muted-foreground">
            Smart Energy Companion
          </span>
        </Link>
        <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 text-sm">
          <Link
            href={`/dashboard${query}`}
            className={cn(
              "rounded-md px-2.5 py-1.5 font-medium transition-colors hover:bg-muted",
              pathname === "/dashboard"
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            Overview
          </Link>
          <Link
            href={`/dashboard/year${query}`}
            className={cn(
              "rounded-md px-2.5 py-1.5 font-medium transition-colors hover:bg-muted",
              pathname === "/dashboard/year"
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            Year
          </Link>
        </nav>
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
