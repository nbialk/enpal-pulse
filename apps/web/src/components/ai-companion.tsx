"use client";

import { Send } from "lucide-react";

const EXAMPLES = [
  "Warum war meine Rechnung im Dezember höher?",
  "Soll ich das Auto jetzt laden?",
  "Lohnt sich mein Tarif noch?",
];

/**
 * Placeholder for the conversational layer. The visual slot is wired into the
 * dashboard now; the backend will hook into the MCP tools (explain-contract,
 * cheapest-window, energy-balance) later.
 */
export function AICompanion() {
  return (
    <section className="rounded-xl border border-border bg-gradient-to-br from-card to-accent/30 p-5">
      <h2 className="text-base font-semibold tracking-tight">
        Frag deine Energie
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Stell eine Frage in normaler Sprache — die Antwort kommt direkt aus
        deinen Daten.
      </p>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <input
          type="text"
          disabled
          placeholder="z. B. Warum war meine Rechnung höher?"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled
          className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground opacity-60"
          aria-label="Senden"
        >
          <Send className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <span
            key={e}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground"
          >
            {e}
          </span>
        ))}
      </div>
    </section>
  );
}
