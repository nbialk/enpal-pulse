"use client";

import { ArrowDownRight, Sparkles, Zap } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { trpc } from "@/lib/trpc/client";

type SavingsOutput = inferRouterOutputs<AppRouter>["bills"]["savings"];

const eur = (n: number) =>
  n.toLocaleString("de-DE", { maximumFractionDigits: 0 });

function nudge(now: SavingsOutput["now"]) {
  if (!now) return "Live-Daten werden geladen.";
  const price = now.price.toFixed(2).replace(".", ",");
  if (now.pvSurplus) {
    return `Deine Solaranlage produziert gerade Überschuss. Jetzt ist ein guter Moment für E-Auto, Waschmaschine oder Spülmaschine — der Strom ist quasi gratis.`;
  }
  if (now.priceContext === "cheap") {
    return `Strom kostet gerade nur ${price} €/kWh — günstig für die nächsten Stunden. Guter Zeitpunkt für große Verbraucher.`;
  }
  if (now.priceContext === "pricey") {
    return `Strom ist gerade teuer (${price} €/kWh). Wenn möglich, große Verbraucher später laufen lassen.`;
  }
  return `Strompreis aktuell durchschnittlich (${price} €/kWh). Batterie bei ${Math.round(
    now.batterySocPct,
  )} %.`;
}

export function HeroSavings({ householdId }: { householdId: string }) {
  const savings = trpc.bills.savings.useQuery({ householdId });

  if (!savings.data) {
    return <div className="h-44 animate-pulse rounded-xl bg-muted" />;
  }

  const d = savings.data;
  const saving = d.savings > 0;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid gap-px bg-border sm:grid-cols-[1.4fr_1fr]">
        {/* Verdict: Am I saving money? */}
        <div className="bg-card p-6">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ArrowDownRight className="size-3.5" />
            Spare ich Geld?
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {saving ? (
              <>
                Du sparst{" "}
                <span className="text-brand">~{eur(Math.abs(d.savings))} €</span>{" "}
                pro Jahr
              </>
            ) : (
              <>
                Du zahlst{" "}
                <span className="text-destructive">
                  ~{eur(Math.abs(d.savings))} €
                </span>{" "}
                mehr pro Jahr
              </>
            )}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Verglichen mit dem {d.standardTariffName}: deine Rechnung{" "}
            <span className="font-medium text-foreground">
              {eur(d.actualBill)} €
            </span>{" "}
            statt{" "}
            <span className="font-medium text-foreground">
              {eur(d.standardBill)} €
            </span>{" "}
            ({Math.abs(d.savingsPct).toFixed(0)} %{" "}
            {saving ? "günstiger" : "teurer"}).
          </p>
        </div>

        {/* Live nudge: should I use energy now? */}
        <div className="bg-card p-6">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {d.now?.pvSurplus ? (
              <Sparkles className="size-3.5 text-brand" />
            ) : (
              <Zap className="size-3.5" />
            )}
            Jetzt gerade
          </div>
          <p className="mt-3 text-sm leading-relaxed">{nudge(d.now)}</p>
        </div>
      </div>
    </section>
  );
}
