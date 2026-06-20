# Enpal Smart Energy Companion — MCP App

## Purpose

A conversational MCP app that lets a user (human + LLM) explore a household's
2025 energy data: production, consumption, bills, contract terms, dynamic
prices, and proactive insights. Backed by the shared `@enpal/db` Postgres
database (same data as the Next.js dashboard).

## Users

- **Human**: asks questions in chat, reads rendered views.
- **LLM**: reads `structuredContent` to ground answers and chain tools.

## Data source

`@enpal/db` Prisma client. Read-only. Households HH-1001..HH-1004, full-year
2025 at 15-min resolution plus monthly bills, contracts, tariffs, hourly
dynamic spot prices, and pre-detected insight events.

## Tools & Views

| Name | Type | Purpose |
|---|---|---|
| `list-households` | view | Pick a household; shows assets + tariff. |
| `household-overview` | view | Annual summary: bill, self-sufficiency, PV, assets. |
| `monthly-bills` | view | Monthly bill + self-sufficiency trend. |
| `bill-breakdown` | tool | Why the bill changed vs prev month: volume vs price effect, per consumer. |
| `energy-balance` | view | Daily PV vs consumption vs grid for a month. |
| `insights` | view | Anomalies & nudges feed. |
| `explain-contract` | tool | Returns contract terms text (NLP/grounding). |
| `charge-advisor` | tool | When to charge the EV (PV-first). `now` = charge now? `plan` = best windows for a day. |
| `optimize` | tool | "How do I optimize charging?" + "fixed vs dynamic tariff?". Whole-house tariff counterfactual + EV smart-charging potential, flexibility-aware verdict. |

All tools are `readOnlyHint: true`, `openWorldHint: false`,
`destructiveHint: false`.

## Simulated "now"

`getNow()` (`src/now.ts`) anchors a simulated present inside the historical
2025 dataset. Default = the last data point; override via `DEMO_NOW` env.
Hard rule: no tool reads a row with `timestamp > NOW`. Forecasts are
*estimated* from history (`forecastSource: "estimated"`), never peeked from
future actuals.

## Scope-area mapping

- Unified energy view → `household-overview`, `energy-balance`.
- Conversational grounding → all views' `structuredContent` + `explain-contract`.
- Why is my bill higher? → `bill-breakdown`.
- Contract & tariff intelligence → `explain-contract`, `optimize`.
- Charging timing (now / today / tomorrow) → `charge-advisor`.
- Optimize behaviour / switch tariff? → `optimize` (whole-house fixed-vs-dynamic
  counterfactual + EV smart-charging savings; verdict flips on flexibility).
- Proactive insights & nudges → `insights`.

## Out of scope

- Writes / control of assets.
- Auth (single-tenant hackathon data).
