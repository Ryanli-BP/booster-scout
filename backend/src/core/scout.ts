// The whole Scout pipeline as one reusable function.
// Use it from the HTTP API, a CLI, a batch job, a Slack bot, etc.
//
// Two modes:
//  - "live": Claude Opus 5.5 with web search + fetch (needs ANTHROPIC_API_KEY)
//  - "demo": no API key; reads the boutique's own website and writes from templates
import { normaliseSite, runHardChecks, type HardChecks } from "./checks.js";
import { findWebsite, research, write } from "./research.js";
import { demoResearch, guessSite, sleep } from "./demo-research.js";
import { demoDossier, demoWrite } from "./demo-writer.js";
import type { ScoutReport } from "./schema.js";
import { demandFor, demandLine, type Demand } from "./requests.js";

export type ScoutMode = "live" | "demo";

export type ScoutEvent =
  | { type: "stage"; stage: "checks" | "research" | "write"; text: string }
  | { type: "progress"; text: string }
  | { type: "checks"; checks: HardChecks }
  | { type: "dossier"; markdown: string };

export interface ScoutResult {
  query: string;
  mode: ScoutMode;
  checks: HardChecks;
  dossier: string;
  report: ScoutReport;
  demand: Demand | null;
  seconds: number;
}

/** Live if an Anthropic key is configured, unless SCOUT_MODE forces one. */
export function defaultMode(): ScoutMode {
  const forced = process.env.SCOUT_MODE;
  if (forced === "demo" || forced === "live") return forced;
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "live" : "demo";
}

export async function scout(
  query: string,
  onEvent: (e: ScoutEvent) => void = () => {},
  mode: ScoutMode = defaultMode(),
): Promise<ScoutResult> {
  const q = query.trim().slice(0, 200);
  if (!q) throw new Error("Type a boutique name or website.");
  const started = Date.now();
  // In demo mode, pace the log slightly so people can follow the research live
  const say = async (text: string) => {
    onEvent({ type: "progress", text });
    if (mode === "demo") await sleep(220);
  };

  onEvent({ type: "stage", stage: "checks", text: "Checking the storefront" });
  let site = normaliseSite(q);
  if (!site) {
    await say(`Finding the official website for “${q}”`);
    site = mode === "live" ? await findWebsite(q) : await guessSite(q, say);
    await say(site ? `Found ${site}` : "Couldn't find the website. Try typing the URL instead.");
  }
  if (site) await say(`Checking ${site} for Shopify, products and prices`);
  const checks = await runHardChecks(site);
  onEvent({ type: "checks", checks });
  if (mode === "demo" && !checks.site) throw new Error(`Couldn't find a website for “${q}”. Try typing the URL, e.g. rixolondon.com.`);
  if (mode === "demo" && !checks.reachable) throw new Error(`${checks.site} blocked our request (${checks.notes.join(" ")}). Try another boutique.`);

  // Real customer requests for this boutique (from the "Ask your boutique" page)
  const demand = await demandFor(q, checks.site);
  if (demand) await say(`${demand.count} customer request${demand.count > 1 ? "s" : ""} on file for this boutique`);

  onEvent({ type: "stage", stage: "research", text: mode === "live" ? "Researching live on the web" : "Researching the boutique's website" });
  let dossier: string;
  let report: ScoutReport;
  if (mode === "live") {
    dossier = await research(q, checks, (_e, d) => onEvent({ type: "progress", text: (d as { text: string }).text }));
    onEvent({ type: "dossier", markdown: dossier });
    onEvent({ type: "stage", stage: "write", text: "Scoring viability and writing outreach" });
    report = await write(q, checks, dossier, demandLine(demand, q));
  } else {
    const findings = await demoResearch(q, checks, say);
    dossier = demoDossier(findings, checks);
    onEvent({ type: "dossier", markdown: dossier });
    onEvent({ type: "stage", stage: "write", text: "Scoring viability and writing outreach" });
    await say("Scoring viability");
    await say("Writing tailored emails for 3 contacts");
    await say("Writing LinkedIn notes and Day 3 / 7 / 14 follow-ups");
    report = demoWrite(findings, checks, demandLine(demand, findings.brand));
  }
  return { query: q, mode, checks, dossier, report, demand, seconds: Math.round((Date.now() - started) / 1000) };
}

export { runHardChecks, normaliseSite } from "./checks.js";
export type { HardChecks } from "./checks.js";
export { ScoutReport } from "./schema.js";
