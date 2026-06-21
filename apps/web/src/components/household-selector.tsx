"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Household = {
  householdId: string;
  name: string;
  city: string;
  tariff: { name: string; type: string };
};

const TARIFF_LABEL: Record<string, string> = {
  dynamic_hourly: "Dynamic",
  fixed_rate: "Fix",
};

function tariffLabel(type: string) {
  return TARIFF_LABEL[type] ?? "Tariff";
}

function tariffBadgeClass(type: string) {
  return type === "fixed_rate"
    ? "border-brand/20 bg-brand/10 text-brand"
    : "border-primary/20 bg-primary/10 text-primary";
}

function tariffDotClass(type: string) {
  return type === "fixed_rate" ? "bg-brand" : "bg-primary";
}

export function HouseholdSelector({
  households,
  activeId,
  onSelect,
}: {
  households: Household[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const active = households.find((h) => h.householdId === activeId);

  return (
    <Select value={activeId ?? undefined} onValueChange={onSelect}>
      <SelectTrigger
        size="default"
        className="h-auto gap-2 border-transparent bg-transparent py-1.5 font-medium shadow-none hover:bg-accent/60 data-[state=open]:bg-accent/60"
      >
        <SelectValue placeholder="Select household">
          {active && (
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  tariffDotClass(active.tariff.type),
                )}
              />
              <span className="min-w-0 truncate text-left">{active.name}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-[260px]">
        <SelectGroup>
          {households.map((h) => (
            <SelectItem
              key={h.householdId}
              value={h.householdId}
              className="py-2 pr-9"
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{h.name}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 font-normal",
                    tariffBadgeClass(h.tariff.type),
                  )}
                >
                  {tariffLabel(h.tariff.type)}
                </Badge>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
