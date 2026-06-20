"use client";

import { MapPin } from "lucide-react";
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
  return TARIFF_LABEL[type] ?? "Tarif";
}

function tariffBadgeClass(type: string) {
  return type === "fixed_rate"
    ? "border-brand/20 bg-brand/10 text-brand"
    : "border-primary/20 bg-primary/10 text-primary";
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
        className="h-auto w-[260px] py-1.5 [&>span]:flex-1"
      >
        <SelectValue placeholder="Select household">
          {active && (
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-left font-medium">
                {active.name}
              </span>
              <Badge
                variant="outline"
                className={cn("font-normal", tariffBadgeClass(active.tariff.type))}
              >
                {tariffLabel(active.tariff.type)}
              </Badge>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="w-(--radix-select-trigger-width) min-w-[260px]">
        <SelectGroup>
          {households.map((h) => (
            <SelectItem
              key={h.householdId}
              value={h.householdId}
              className="py-2 pr-9"
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium leading-none">
                    {h.name}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">{h.city}</span>
                  </span>
                </span>
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
