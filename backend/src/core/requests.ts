// Customer requests ("Ask your boutique for Booster") and referrals.
//
// Shoppers opt in on a public page: which boutique they want within-the-hour
// delivery from, and the first half of their postcode. An email is stored ONLY if
// they tick "tell me when it's live". Each request gets a share code; requests
// made through someone's link count as their referrals.
//
// Nothing here is ever exposed per person: the API returns counts only.
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export interface CustomerRequest {
  id: string;
  code: string;               // this requester's share code
  boutique: string;           // as typed
  key: string;                // normalised boutique key, for matching
  outward: string;            // first half of postcode only, e.g. "W1U"
  inZone: boolean;
  email: string | null;       // only when notify is true
  notify: boolean;
  referredBy: string | null;  // share code of the person who referred them
  createdAt: string;
}

export interface Demand {
  boutique: string;
  key: string;
  count: number;
  inZone: number;
  referred: number;
  districts: Record<string, number>;
  lastAt: string;
}

const FILE = process.env.REQUESTS_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "requests.json");
const ZONE = /^(W1[A-Z]?|SW1[A-Z]?|WC[12][A-Z]?|EC[1-4][A-Z]?)$/;
const OUTWARD = /^[A-Z]{1,2}\d[A-Z\d]?$/;

/** "RIXO", "Rixo London", "rixolondon.com", "https://www.rixolondon.com" → "rixo" */
export function boutiqueKey(s: string): string {
  let k = s.toLowerCase().trim();
  try {
    if (/\.[a-z]{2,}/.test(k) && !/\s/.test(k)) k = new URL(/^https?:/.test(k) ? k : `https://${k}`).hostname;
  } catch { /* plain name */ }
  return k
    .replace(/^www\./, "")
    .replace(/\.(co\.uk|com|london|uk|co|net|store|shop)$/, "")
    .replace(/['’&+]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/london$/, "")
    .replace(/^the/, "") || "unknown";
}

let queue: Promise<unknown> = Promise.resolve();
async function load(): Promise<CustomerRequest[]> {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")) as CustomerRequest[]; } catch { return []; }
}
async function save(all: CustomerRequest[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2));
}

export class RequestError extends Error {}

export async function addRequest(input: { boutique?: unknown; postcode?: unknown; email?: unknown; notify?: unknown; ref?: unknown }) {
  const boutique = String(input.boutique ?? "").trim().slice(0, 80);
  if (boutique.length < 2) throw new RequestError("Tell us which boutique.");
  const outward = String(input.postcode ?? "").toUpperCase().replace(/\s+/g, " ").trim().split(" ")[0];
  if (!OUTWARD.test(outward)) throw new RequestError("Add the first half of your postcode, e.g. W1U.");
  const notify = input.notify === true || input.notify === "true";
  const email = notify ? String(input.email ?? "").trim().toLowerCase().slice(0, 120) : "";
  if (notify && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError("Add an email so we can tell you when it's live, or untick the box.");
  const ref = String(input.ref ?? "").trim().slice(0, 16) || null;

  const run = queue.then(async () => {
    const all = await load();
    const req: CustomerRequest = {
      id: randomBytes(8).toString("hex"),
      code: randomBytes(4).toString("hex"),
      boutique, key: boutiqueKey(boutique), outward, inZone: ZONE.test(outward),
      email: notify ? email : null, notify,
      referredBy: ref && all.some((r) => r.code === ref) ? ref : null,
      createdAt: new Date().toISOString(),
    };
    all.push(req);
    await save(all);
    const same = all.filter((r) => r.key === req.key);
    return { request: req, count: same.length, inZone: same.filter((r) => r.inZone).length };
  });
  queue = run.catch(() => {});
  return run;
}

function summarise(all: CustomerRequest[]): Demand[] {
  const by = new Map<string, Demand>();
  const names = new Map<string, Map<string, number>>();
  for (const r of all) {
    const d = by.get(r.key) ?? { boutique: r.boutique, key: r.key, count: 0, inZone: 0, referred: 0, districts: {}, lastAt: r.createdAt };
    d.count++;
    if (r.inZone) d.inZone++;
    if (r.referredBy) d.referred++;
    d.districts[r.outward] = (d.districts[r.outward] ?? 0) + 1;
    if (r.createdAt > d.lastAt) d.lastAt = r.createdAt;
    by.set(r.key, d);
    // display name = the spelling people use most
    const n = names.get(r.key) ?? new Map<string, number>();
    n.set(r.boutique, (n.get(r.boutique) ?? 0) + 1);
    names.set(r.key, n);
  }
  for (const d of by.values()) d.boutique = [...names.get(d.key)!.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return [...by.values()].sort((a, b) => b.inZone - a.inZone || b.count - a.count);
}

export async function demandSummary(): Promise<Demand[]> {
  return summarise(await load());
}

/** Demand for one boutique, matched by any of its names or its website. */
export async function demandFor(...names: (string | null | undefined)[]): Promise<Demand | null> {
  const keys = new Set(names.filter(Boolean).map((n) => boutiqueKey(n!)));
  return (await demandSummary()).find((d) => keys.has(d.key)) ?? null;
}

/** How many people a share code has brought in (for the requester's thank-you page). */
export async function referralCount(code: string): Promise<number> {
  return (await load()).filter((r) => r.referredBy === code).length;
}

/** One line for the boutique pitch, from real requests only. */
export function demandLine(d: Demand | null, brand: string): string | null {
  if (!d || d.count === 0) return null;
  const byCount = Object.entries(d.districts).sort((a, b) => b[1] - a[1]);
  const top = byCount.slice(0, 3).map(([k]) => k).join(", ");
  const topInZone = byCount.filter(([k]) => ZONE.test(k)).slice(0, 3).map(([k]) => k).join(", ");
  return d.inZone > 0
    ? `${d.count} shopper${d.count > 1 ? "s have" : " has"} asked us to bring within-the-hour delivery from ${brand} to them, ${d.inZone} of them in postcodes we already cover (${topInZone}).`
    : `${d.count} shopper${d.count > 1 ? "s have" : " has"} asked us for within-the-hour delivery from ${brand} (${top}).`;
}
