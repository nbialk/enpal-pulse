<p align="center">
  <img src="apps/web/public/banner.png" alt="Enpal Pulse" />
</p>

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" /></a>
  <a href="https://docs.skybridge.tech"><img src="https://img.shields.io/badge/Skybridge-1.1.1-2563eb?style=flat-square&logo=react&logoColor=white" alt="Skybridge" /></a>
  <a href="https://pulse.niklas.sh"><img src="https://img.shields.io/badge/Demo-pulse.niklas.sh-7c3aed?style=flat-square" alt="Live demo" /></a>
</p>

<p align="center">
  <a href="https://www.loom.com/share/REPLACE_WITH_LOOM_ID"><strong>▶ Watch the demo video</strong></a>
</p>

Enpal Pulse brings a household's solar production, battery state, heat pump and
EV load, grid flows, dynamic tariffs and contract terms together in one place.
Built for the **Enpal Smart Energy Companion** challenge, it answers everyday
energy questions in plain language and helps you decide when to use power.

It ships as two surfaces over the same data:

- A **Next.js dashboard** for the unified energy view.
- A **Skybridge MCP server** with interactive React views, so an LLM in ChatGPT
  or Claude can reason over the same household data conversationally.

## Demo

The unified energy view on the dashboard:

<p align="center">
  <img src="apps/web/public/demo-energy-flow.gif" alt="Daily energy flow on the dashboard" width="700" />
</p>

The same household data, reasoned over conversationally in Claude:

<p align="center">
  <img src="apps/web/public/demo-claude.gif" alt="Asking Claude about household energy via the MCP server" width="420" />
</p>

## Try it

- **Dashboard:** [pulse.niklas.sh](https://pulse.niklas.sh)
- **MCP server URL:** `https://mcp.pulse.niklas.sh/mcp`

Add the MCP server URL to any compatible client (ChatGPT, Claude, etc.), then
ask things like _"why was my bill higher in January?"_, _"when should I charge
my car today?"_, or _"what's my energy flow looking like right now?"_.

To connect the MCP server:

- **ChatGPT** — Settings → Connectors → add the URL above (developer mode /
  custom connectors).
- **Claude** — Settings → Connectors → Add custom connector → paste the URL.

## How it works

One Postgres database holds the full household dataset. Both surfaces live in a
single **pnpm + Turborepo monorepo** and share one `packages/db` package (Prisma
schema + client), so the Next.js dashboard and the Skybridge MCP server never
duplicate data logic.

```mermaid
flowchart LR
  User((Homeowner)) --> Dash[Next.js dashboard]
  User --> LLM[ChatGPT / Claude]
  subgraph Monorepo["Monorepo · pnpm + Turborepo"]
    Dash --> TRPC[tRPC routers]
    LLM --> MCP[MCP tools]
    TRPC --> DB["packages/db · Prisma"]
    MCP --> DB
  end
  DB --> PG[(Neon Postgres)]
```

### The AI layer

The AI does not sit on top of a chatbot bolted to a database. Each MCP tool is a
small, purpose-built function that pulls structured household data, runs the
domain logic (bill decomposition, optimal-window search, energy-flow snapshot)
and returns **both** a structured result and an interactive React view. That
keeps the model **grounded**: it answers from real computed numbers rather than
guessing, and the user sees the underlying view alongside the explanation. All
tools are read-only, so the model can explore freely without side effects.

## MCP Tools

Each tool renders an interactive React view alongside its structured result.

| Tool | View | Description |
| --- | --- | --- |
| **daily-energy-flow** | Daily energy flow | Live energy-flow snapshot for a household at a moment of the day: solar split into self-use, battery charging and export, plus grid import, battery discharge and SoC. |
| **explain-bill** | Bill driver breakdown | Decomposes the euro difference between two months into drivers (energy cost, feed-in credit, base fee) and charts consumption by area (house, heat pump, EV). |
| **best-time-to-run** | Recommended window | Best window today/tomorrow to run a flexible load (EV, washing machine, dishwasher, heat pump) — lowest cost on dynamic tariffs, most PV self-consumption on fixed. |

All tools are read-only (`readOnlyHint: true`, `openWorldHint: false`).

## Data

A synthetic full-year 2025 dataset for four households (Familie Becker,
Familie Schmidt, Familie Yilmaz, WG Sonnenallee) at 15-minute resolution,
backed by Postgres via Prisma:

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
- **Hosting:** Web and MCP on Vercel, backed by Neon Postgres

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
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:push` | Push the Prisma schema to the database |
| `pnpm db:seed` | Seed the database with the 2025 dataset |
| `pnpm db:studio` | Open Prisma Studio |

## Deployment

Both apps share a single **Neon Postgres** database:

- **Web** (`apps/web`) — standard Next.js build on **Vercel**.
- **MCP** (`apps/mcp`) — `skybridge build`, deployed to **Vercel**.

## Resources

- [Skybridge Documentation](https://docs.skybridge.tech/)
- [Apps SDK Documentation](https://developers.openai.com/apps-sdk)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
