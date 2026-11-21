# Booster Scout

Pitch-deck material: see [PITCH_BRIEF.md](PITCH_BRIEF.md).

Type a London boutique → Scout checks the storefront, researches it live with Claude (web search + fetch), scores the fit for Booster, finds the right people and writes multi-threaded outreach (emails, LinkedIn notes, Day 3/7/14 follow-ups).

```
backend/   reusable API + core library (Node/TypeScript, Claude API)
web/       static front-end that calls the API (no build step)
```

## Two modes

| Mode | When | What it does |
|---|---|---|
| **Demo** (default without a key) | no `ANTHROPIC_API_KEY` | Reads the boutique's own public website: storefront, sitemap, store/contact/delivery pages, Shopify product catalogue. Extracts real postcodes, products, prices, delivery promise and public inboxes, then writes outreach from Booster-voice templates. ~8 seconds, free, nothing invented. |
| **Live** | `ANTHROPIC_API_KEY` set | Claude Opus 5.5 searches and reads the wider web (press, LinkedIn, Companies House) and writes fully bespoke outreach. ~1–2 min. |

Force one with `SCOUT_MODE=demo|live` in `.env`, or per request with `mode=demo|live`.

## Run

```
cd backend
npm install
cp .env.example .env        # optional: add ANTHROPIC_API_KEY for live mode
npm run dev                 # API on http://localhost:8787
```

In a second terminal:

```
node web/serve.mjs          # web on http://localhost:3000
```

## Reuse the backend

**HTTP API** (CORS on; optional `x-api-key` auth via `SCOUT_API_KEY`)

| Method | Path | What |
|---|---|---|
| GET | `/v1/health` | liveness |
| GET | `/v1/scout/stream?q=rixolondon.com` | Server-Sent Events: `stage`, `progress`, `checks`, `dossier`, then `result` or `error` |
| POST | `/v1/scout` `{"query":"Rixo"}` | full result as JSON (takes 1–2 min) |
| GET | `/v1/powerbuyers/stream?q=Rixo` | SSE: hotels, clubs, venues and offices within a 10-minute walk of the boutique, with email, call script and ask for each |
| POST | `/v1/powerbuyers` `{"query":"W1U 4AD"}` | same, as JSON (boutique name, website or London postcode) |
| POST | `/v1/checks` `{"site":"rixolondon.com"}` | storefront checks only: Shopify, prices, shipping policy (fast, no AI) |
| GET | `/v1/runs` | saved runs |
| GET | `/v1/runs/:id` | one saved run |

```
curl -X POST http://localhost:8787/v1/scout -H "content-type: application/json" -d '{"query":"rixolondon.com"}'
```

**CLI**: `npm run scout -- "rixolondon.com"` prints the report JSON.

**Library**: `import { scout } from "./backend/src/core/scout.ts"`, then `await scout("Rixo", event => …)`.

Point the web client at a deployed API by editing `web/config.js`.

## What's inside
- `core/checks.ts`: deterministic storefront checks (Shopify fingerprints, `/products.json` price stats, shipping policy)
- `core/research.ts`: Claude Opus 5.5 with server-side `web_search` + `web_fetch` → research dossier; then structured output (Zod schema) → scorecard + outreach
- `core/booster.ts`: Booster facts, voice and the outreach playbook (benchmarks)
- `core/schema.ts`: the report schema
