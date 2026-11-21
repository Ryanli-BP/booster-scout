// Booster Scout API: a standalone backend any client can call.
//
//   GET  /v1/health                 → { ok, auth, mode }   (mode: "live" with an Anthropic key, else "demo")
//   GET  /v1/scout/stream?q=…       → Server-Sent Events: stage, progress, checks, dossier, result, error
//   POST /v1/scout  {"query": "…"}  → full ScoutResult JSON (waits ~1–2 min)
//   POST /v1/checks {"site": "…"}   → storefront checks only (fast, no AI)
//   GET  /v1/powerbuyers/stream?q=… → SSE: hotels, clubs, venues, offices near a boutique + outreach
//   POST /v1/powerbuyers {"query"}  → same, as JSON (boutique name, website or London postcode)
//   POST /v1/requests {boutique, postcode, notify, email?, ref?} → public: a shopper asks for a boutique (no API key needed)
//   GET  /v1/requests/summary       → demand per boutique: counts, in-zone, districts, referrals (no personal data)
//   GET  /v1/requests/referrals/:code → how many people a share link has brought in
//   GET  /v1/runs                   → saved runs [{ id, kind, name, … }]
//   GET  /v1/runs/:id               → one saved ScoutResult
//
// Every scout endpoint accepts mode=demo|live (query param or JSON body) to override the default.
// Optional auth: set SCOUT_API_KEY and send it as the `x-api-key` header (or ?key= for EventSource).
// CORS: set CORS_ORIGIN (default "*").
import "./env.js";
import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { findPowerBuyers, type PowerBuyerResult } from "./core/powerbuyers.js";
import { addRequest, demandSummary, referralCount, RequestError } from "./core/requests.js";
import { scout, runHardChecks, normaliseSite, defaultMode, type ScoutMode, type ScoutResult } from "./core/scout.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNS = process.env.RUNS_DIR ?? path.join(here, "..", "runs");
const API_KEY = process.env.SCOUT_API_KEY;

const app = express();
app.use(express.json({ limit: "100kb" }));

app.use((req, res, next) => {
  res.set({
    "access-control-allow-origin": process.env.CORS_ORIGIN ?? "*",
    "access-control-allow-headers": "content-type, x-api-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function auth(req: Request, res: Response, next: NextFunction) {
  if (!API_KEY) return next();
  if (req.get("x-api-key") === API_KEY || req.query.key === API_KEY) return next();
  res.status(401).json({ error: "Missing or wrong x-api-key." });
}

function errorMessage(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(String(err)))
    return { status: 500, message: "The server has no valid Anthropic API key. Set ANTHROPIC_API_KEY in backend/.env." };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: "Rate limited by the Anthropic API. Try again shortly." };
  if (err instanceof Anthropic.APIError) return { status: 502, message: `Anthropic API error ${err.status}: ${err.message}` };
  return { status: 500, message: err instanceof Error ? err.message : String(err) };
}

async function saveRun(result: ScoutResult | PowerBuyerResult): Promise<string> {
  const name = "report" in result ? result.report.boutique.name : `power-buyers-${result.boutique.name}`;
  const slug = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${slug}`;
  await fs.mkdir(RUNS, { recursive: true });
  await fs.writeFile(path.join(RUNS, `${id}.json`), JSON.stringify(result, null, 2));
  return id;
}

const pickMode = (m: unknown): ScoutMode => (m === "demo" || m === "live" ? m : defaultMode());

app.get("/v1/health", (_req, res) => res.json({ ok: true, auth: Boolean(API_KEY), mode: defaultMode() }));

app.get("/v1/scout/stream", auth, async (req, res) => {
  res.set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.flushHeaders();
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const result = await scout(String(req.query.q ?? ""), ({ type, ...data }) => send(type, data), pickMode(req.query.mode));
    const id = await saveRun(result);
    send("result", { id, ...result });
  } catch (err) {
    console.error(err);
    send("error", errorMessage(err));
  }
  res.end();
});

app.post("/v1/scout", auth, async (req, res) => {
  try {
    const result = await scout(String(req.body?.query ?? ""), undefined, pickMode(req.body?.mode));
    const id = await saveRun(result);
    res.json({ id, ...result });
  } catch (err) {
    console.error(err);
    const { status, message } = errorMessage(err);
    res.status(status).json({ error: message });
  }
});

// Customer requests + referrals. POST is public (shoppers use it), so it skips the
// API key but is rate-limited per IP. The summary returns counts only.
const hits = new Map<string, number[]>();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip ?? "unknown", now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return res.status(429).json({ error: "Too many requests. Try again in a minute." });
  hits.set(ip, [...recent, now]);
  next();
}

app.post("/v1/requests", rateLimit, async (req, res) => {
  try {
    const { request, count, inZone } = await addRequest(req.body ?? {});
    res.json({ ok: true, code: request.code, boutique: request.boutique, inZone: request.inZone, count, inZoneCount: inZone });
  } catch (err) {
    if (err instanceof RequestError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Couldn't save your request." });
  }
});

app.get("/v1/requests/summary", auth, async (_req, res) => res.json(await demandSummary()));

app.get("/v1/requests/referrals/:code", async (req, res) =>
  res.json({ referred: await referralCount(String(req.params.code).slice(0, 16)) }));

// Power buyers: hotels, clubs, venues and offices near a boutique that would back Booster
app.get("/v1/powerbuyers/stream", auth, async (req, res) => {
  res.set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.flushHeaders();
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const result = await findPowerBuyers(String(req.query.q ?? ""), ({ type, ...data }) => send(type, data));
    const id = await saveRun(result);
    send("result", { id, ...result });
  } catch (err) {
    console.error(err);
    send("error", errorMessage(err));
  }
  res.end();
});

app.post("/v1/powerbuyers", auth, async (req, res) => {
  try {
    const result = await findPowerBuyers(String(req.body?.query ?? ""));
    const id = await saveRun(result);
    res.json({ id, ...result });
  } catch (err) {
    console.error(err);
    const { status, message } = errorMessage(err);
    res.status(status).json({ error: message });
  }
});

app.post("/v1/checks", auth, async (req, res) => {
  const site = normaliseSite(String(req.body?.site ?? ""));
  if (!site) return res.status(400).json({ error: "Give a website, e.g. {\"site\": \"rixolondon.com\"}." });
  res.json(await runHardChecks(site));
});

app.get("/v1/runs", auth, async (_req, res) => {
  const files = (await fs.readdir(RUNS).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort().reverse();
  const runs = await Promise.all(
    files.slice(0, 20).map(async (f) => {
      const d = JSON.parse(await fs.readFile(path.join(RUNS, f), "utf8")) as ScoutResult | PowerBuyerResult;
      const id = f.replace(/\.json$/, "");
      if ("report" in d) return { id, kind: "boutique", name: d.report?.boutique?.name ?? d.query, verdict: d.report?.viability?.verdict, mode: d.mode };
      return { id, kind: "powerbuyers", name: d.boutique.name, count: d.buyers.length };
    }),
  );
  res.json(runs);
});

app.get("/v1/runs/:id", auth, async (req, res) => {
  try {
    const raw = await fs.readFile(path.join(RUNS, `${path.basename(String(req.params.id))}.json`), "utf8");
    res.type("json").send(raw);
  } catch {
    res.status(404).json({ error: "Run not found." });
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Booster Scout API on http://localhost:${port}`));
