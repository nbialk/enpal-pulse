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
| `energy-balance` | view | Daily PV vs consumption vs grid for a month. |
| `insights` | view | Anomalies & nudges feed. |
| `explain-contract` | tool | Returns contract terms text (NLP/grounding). |
| `cheapest-window` | tool | Cheapest dynamic-price hours in a date range. |
| `best-time-to-run` | view | Best window today/tomorrow to run a flexible load (EV, washer, dishwasher, heat pump), optimizing cost + PV self-consumption. |
| `explain-bill` | view | Bill driver breakdown (month vs. month) + stacked consumption-by-area chart for the last N months. |

All tools are `readOnlyHint: true`, `openWorldHint: false`,
`destructiveHint: false`.

## Scope-area mapping

- Unified energy view → `household-overview`, `energy-balance`.
- Conversational grounding → all views' `structuredContent` + `explain-contract`.
- Contract & tariff intelligence → `explain-contract`, `cheapest-window`.
- Proactive insights & nudges → `insights`.

## Out of scope

- Writes / control of assets.
- Auth (single-tenant hackathon data).
