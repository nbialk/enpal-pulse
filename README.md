# Enpal Track — The Smart Energy Companion

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" /></a>
  <a href="https://docs.skybridge.tech"><img src="https://img.shields.io/badge/Skybridge-1.1.1-2563eb?style=flat-square&logo=react&logoColor=white" alt="Skybridge" /></a>
  <a href="https://www.prisma.io"><img src="https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma" /></a>
  <a href="https://enpal.niklas.sh"><img src="https://img.shields.io/badge/Demo-enpal.niklas.sh-7c3aed?style=flat-square" alt="Live demo" /></a>
</p>

Turns a household's messy energy reality — solar production, battery state,
heat-pump and EV load, grid flows, dynamic tariffs, and contract terms — into
one clear, intuitive view. Built for the **Enpal Smart Energy Companion**
challenge: explain energy data in plain language, anticipate the user's
questions, and nudge them toward smarter decisions.

It ships as two surfaces over the same data:

- A **Next.js dashboard** for the unified energy view.
- A **Skybridge MCP server** with interactive React views, so an LLM in ChatGPT
  or Claude can reason over the same household data conversationally.

## Try it

- **Dashboard:** [enpal.niklas.sh](https://enpal.niklas.sh)
- **MCP server URL:** `https://mcp.enpal.niklas.sh/mcp`

Add the MCP server URL to any compatible client (ChatGPT, Claude, etc.), then
ask things like _"why was my bill higher in January?"_, _"when is the cheapest
time to charge the car?"_, or _"explain my contract terms"_.

## MCP Tools

| Tool | Type | Description |
| --- | --- | --- |
| **list-households** | view | Pick a household; shows assets + tariff. |
| **household-overview** | view | Annual summary: bill, self-sufficiency, PV, assets. |
| **monthly-bills** | view | Monthly bill + self-sufficiency trend. |
| **energy-balance** | view | Daily PV vs. consumption vs. grid for a month. |
| **insights** | view | Anomalies & nudges feed. |
| **explain-contract** | tool | Contract terms in plain language. |
| **cheapest-window** | tool | Cheapest dynamic-price hours in a date range. |
| **best-time-to-run** | view | Best window today/tomorrow to run a flexible load (EV, washer, dishwasher, heat pump). |

All tools are read-only (`readOnlyHint: true`, `openWorldHint: false`).

## Data

A synthetic full-year 2025 dataset for four households (HH-1001..HH-1004) at
15-minute resolution, backed by Postgres via Prisma:

- **Households, tariffs & contracts** — assets (PV, battery, heat pump, EV),
  dynamic vs. standard tariffs, full contract terms.
- **Energy records** — PV, house load, heat pump, EV, battery SoC, grid
  import/export, and price per 15-min interval (~140k rows).
- **Dynamic prices** — hourly spot prices for the year.
- **Monthly bills & insight events** — pre-computed bills, self-sufficiency,
  and detected anomalies/nudges.

## Tech Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Web:** Next.js 16, tRPC, React Query, Tailwind, shadcn/ui
- **MCP:** Skybridge (Vite + React views), `@modelcontextprotocol/sdk`
- **Data:** Prisma 7 with the `@prisma/adapter-pg` driver adapter, Neon Postgres
- **Hosting:** Vercel (both apps, region `fra1`), Neon Postgres (`eu-central-1`)

## Project Structure

```
├── apps/
│   ├── web/              # Next.js dashboard (tRPC + React Query)
│   │   └── src/
│   │       ├── app/      # App Router pages + API route
│   │       └── server/   # tRPC routers (households, energy, bills, prices, insights)
│   └── mcp/              # Skybridge MCP server
│       └── src/
│           ├── server.ts # Tool + view definitions
│           ├── db.ts     # Prisma client access
│           └── views/    # One React view per tool
├── packages/
│   └── db/               # Shared Prisma schema, client, and seed
├── turbo.json
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 11+
- A Postgres database (local via `docker-compose.yml`, or hosted)

### Install

```bash
pnpm install
```

### Configure

Copy the example env and set your database URL:

```bash
cp .env.example .env
# DATABASE_URL="postgresql://enpal:enpal@localhost:5439/enpal_track?schema=public"
```

### Set up the database

```bash
docker compose up -d   # optional: local Postgres
pnpm db:push           # apply the schema
pnpm db:seed           # load the 2025 dataset
```

### Run

```bash
pnpm dev
```

This starts both apps via Turborepo:

- **Web dashboard** at `http://localhost:3000`
- **MCP server** at `http://localhost:3001/mcp` (Skybridge DevTools at `http://localhost:3001`)

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run web + MCP in dev mode |
| `pnpm build` | Build all apps and packages |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm db:push` | Push the Prisma schema to the database |
| `pnpm db:seed` | Seed the database with the 2025 dataset |
| `pnpm db:studio` | Open Prisma Studio |

## Deployment

Both apps are hosted on **Vercel** in region `fra1`, backed by a single **Neon
Postgres** in `eu-central-1`:

- **Web** (`apps/web`) — standard Next.js build.
- **MCP** (`apps/mcp`) — `skybridge build` emits a Vercel
  [Build Output API](https://vercel.com/docs/build-output-api) tree, deployed
  with `vercel deploy --prebuilt`.

CI in [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) deploys
both apps on push to `main` (path-filtered).

## Resources

- [Skybridge Documentation](https://docs.skybridge.tech/)
- [Apps SDK Documentation](https://developers.openai.com/apps-sdk)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
