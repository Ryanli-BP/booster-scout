// Power-buyer finder: businesses near a boutique that buy luxury on someone else's
// behalf (hotel concierges, members' clubs, event venues, offices with PA teams).
// Win them first, then walk into the boutique with "these neighbours want it".
//
// Only businesses, only public business contact details (OpenStreetMap + their own
// websites). No private individuals are looked up or profiled.
import { get, htmlToText, normaliseSite, runHardChecks, type HardChecks } from "./checks.js";
import { demoResearch, guessSite, sleep, type Store } from "./demo-research.js";
import { geocode, metresBetween, placesAround, POSTCODE_RE, type LatLng, type OsmPlace } from "./geo.js";

export type BuyerKind = "hotel" | "club" | "venue" | "office";

export interface PowerBuyer {
  id: string;
  name: string;
  kind: BuyerKind;
  kindLabel: string;
  detail: string;
  address: string;
  lat: number;
  lng: number;
  metres: number;
  walkMins: number;
  stars: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  emailSource: string | null;
  osmUrl: string;
  targetRole: string;
  why: string;
  score: number;
  outreach: { subject: string; body: string; phoneScript: string; ask: string };
}

export interface PowerBuyerResult {
  kind: "powerbuyers";
  query: string;

  boutique: { name: string; site: string | null; store: { address: string; postcode: string } | null; center: LatLng; area: string };
  buyers: PowerBuyer[];
  summary: { total: number; within5: number; within10: number; byKind: Record<BuyerKind, number> };
  proofLine: string;
  seconds: number;
}

export type PBEvent = { type: "stage"; stage: string; text: string } | { type: "progress"; text: string } | { type: "center"; center: LatLng; label: string };

const KIND_LABEL: Record<BuyerKind, string> = { hotel: "Hotel concierge", club: "Members' club", venue: "Events & venues", office: "Office / PA team" };
const AREA: Record<string, string> = {
  W1J: "Mayfair", W1K: "Mayfair", W1S: "Mayfair", W1B: "Regent Street", W1C: "Oxford Street", W1D: "Soho", W1F: "Soho",
  W1G: "Marylebone", W1H: "Marylebone", W1U: "Marylebone", W1T: "Fitzrovia", W1W: "Fitzrovia", SW1A: "St James's", SW1Y: "St James's",
  SW1X: "Belgravia", SW1W: "Belgravia", SW1P: "Westminster", SW1H: "Westminster", SW1E: "Victoria", WC1: "Bloomsbury", WC2: "Covent Garden", EC: "the City",
};
const areaOf = (pc: string) => { const o = pc.split(" ")[0].toUpperCase(); return AREA[o] ?? AREA[o.slice(0, 3)] ?? AREA[o.slice(0, 2)] ?? "central London"; };

const LUXE = /(claridge|connaught|dorchester|ritz|langham|savoy|chiltern|beaumont|mandarin|four seasons|corinthia|rosewood|bulgari|peninsula|berkeley|lanesborough|goring|brown's|mandeville|marylebone hotel|edition|soho house|annabel|mark's|5 hertford|arts club|groucho|home house|family office|capital|partners|private)/i;
const BUDGET = /(premier inn|travelodge|ibis|easyhotel|holiday inn express|hub by|z hotel|point a|hostel|yha|generator)/i;

function classify(t: Record<string, string>): { kind: BuyerKind; detail: string } | null {
  if (t.tourism === "hotel") return { kind: "hotel", detail: "Hotel" };
  if (t.tourism === "apartment") return { kind: "hotel", detail: "Serviced apartments" };
  if (t.tourism === "guest_house") return { kind: "hotel", detail: "Guest house" };
  if (t.club || t.amenity === "social_club") return { kind: "club", detail: t.club && t.club !== "yes" ? `Club (${t.club.replace(/_/g, " ")})` : "Members' club" };
  if (t.amenity === "events_venue" || t.amenity === "conference_centre") return { kind: "venue", detail: "Event venue" };
  if (t.office === "event_management" || t.office === "wedding_planner") return { kind: "venue", detail: t.office === "wedding_planner" ? "Wedding planner" : "Event management" };
  if (t.office) return { kind: "office", detail: { financial: "Finance firm", company: "Company office", lawyer: "Law firm", consulting: "Consultancy", estate_agent: "Estate agent", private_office: "Private office" }[t.office] ?? "Office" };
  return null;
}

const ROLE: Record<BuyerKind, { role: string; why: string }> = {
  hotel: { role: "Head Concierge", why: "Guests ask the concierge for a dress, a gift or a forgotten cufflink for tonight. They already run between shops for them." },
  club: { role: "Front-of-house / Membership Manager", why: "Members expect anything within the hour. A trusted way to get boutique pieces delivered is a member perk." },
  venue: { role: "Events Manager", why: "Event days go wrong at the last minute: a torn hem, a missing gift, a speaker's tie. They need it now, not tomorrow." },
  office: { role: "Office Manager / Executive Assistant team", why: "PAs buy client gifts and fix wardrobe emergencies before meetings. Speed matters more than price." },
};

function score(kind: BuyerKind, t: Record<string, string>, metres: number): number {
  let s = { hotel: 40, club: 35, venue: 28, office: 22 }[kind];
  const stars = parseFloat((t.stars ?? "").replace(",", "."));
  if (stars) s += stars * 6;
  if (LUXE.test(t.name)) s += 18;
  if (BUDGET.test(t.name)) s -= 40;
  if (t.website || t["contact:website"]) s += 8;
  if (t.email || t["contact:email"] || t.phone || t["contact:phone"]) s += 5;
  if (kind === "office" && !(t.website || t["contact:website"])) s -= 15;
  return Math.round(s - metres / 45);
}

const isPostcode = (q: string) => POSTCODE_RE.test(q) && /\d/.test(q);

/** Look for a concierge/events/hello inbox on the business's own site. */
async function findInbox(website: string, kind: BuyerKind): Promise<{ email: string; source: string } | null> {
  const site = normaliseSite(website);
  if (!site) return null;
  const prefer = kind === "hotel" ? /concierge|guest|reception|frontdesk|front\.desk|stay|hello|info|reservations/ : kind === "venue" ? /events?|enquir|hello|info/ : /hello|info|office|reception|enquir|contact/;
  for (const path of ["", "/contact", "/contact-us"]) {
    const r = await get(site + path, 5000);
    if (!r || !r.ok) continue;
    const html = await r.text();
    const emails = [...new Set([...(html.matchAll(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)), ...htmlToText(html).matchAll(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi)].map((m) => m[1].toLowerCase()))]
      .filter((e) => !/(sentry|wixpress|example|\.png|\.jpg|privacy|gdpr|dpo|careers|jobs|recruit)/.test(e));
    const best = emails.find((e) => prefer.test(e.split("@")[0])) ?? emails[0];
    if (best) return { email: best, source: r.url };
  }
  return null;
}

function writeOutreach(b: Omit<PowerBuyer, "outreach">, ctx: { boutique: string; storeStreet: string; area: string; product: string | null }) {
  const walk = `${b.walkMins}-minute walk`;
  const sign = "\n\n— The Booster team\ncontact@booster.earth";
  const piece = ctx.product ?? "a dress or a gift";
  const opener: Record<BuyerKind, string> = {
    hotel: `When a guest at ${b.name} needs ${piece} from ${ctx.boutique} before dinner, someone from your desk usually has to go and get it. ${ctx.boutique}'s ${ctx.storeStreet} store is a ${walk} away.`,
    club: `Your members are a ${walk} from ${ctx.boutique} on ${ctx.storeStreet}, but buying online still means waiting days.`,
    venue: `On an event day at ${b.name}, the thing that goes wrong is always last-minute: a missing gift, a torn hem, a forgotten tie. ${ctx.boutique} on ${ctx.storeStreet} is a ${walk} away.`,
    office: `When someone at ${b.name} needs a client gift or a fresh shirt before a meeting, ${ctx.boutique} on ${ctx.storeStreet} is a ${walk} away, but no one has time to go.`,
  };
  const benefit: Record<BuyerKind, string> = {
    hotel: "Booster delivers online orders from London boutiques within the hour, in a sealed bag, handed over with a code. Your guests order on the boutique's own site and it arrives at the front desk.",
    club: "Booster delivers online orders from London boutiques within the hour, in a sealed bag, straight to the club. It could be a quiet member perk.",
    venue: "Booster delivers online orders from London boutiques within the hour, in a sealed bag, straight to your door.",
    office: "Booster delivers online orders from London boutiques within the hour, in a sealed bag, straight to reception.",
  };
  const ask = `Could we tell ${ctx.boutique} that ${b.name} would use it? A one-line reply is enough, and you'd get early access for your ${b.kind === "hotel" ? "guests" : b.kind === "club" ? "members" : b.kind === "venue" ? "events" : "team"} as soon as it's live.`;
  return {
    subject: b.kind === "hotel" ? `For your guests: ${ctx.boutique}, within the hour` : `${ctx.boutique}, delivered to ${b.name} within the hour`,
    body: `Hello,\n\n${opener[b.kind]}\n\n${benefit[b.kind]}\n\nWe're asking ${ctx.boutique} to switch it on for their ${ctx.area} store. ${ask}${sign}`,
    phoneScript: `“Hi, is that the ${b.kind === "hotel" ? "concierge desk" : b.kind === "venue" ? "events team" : b.kind === "club" ? "front desk" : "office manager"}? I'm calling from Booster. We deliver from boutiques like ${ctx.boutique} on ${ctx.storeStreet}, a ${walk} from you, within the hour. Would that be useful for your ${b.kind === "hotel" ? "guests" : b.kind === "club" ? "members" : "team"}? If so, could I put ${b.name} down as a supporter when we speak to ${ctx.boutique}?”`,
    ask: "Back Booster (one-line yes) + early access",
  };
}

export async function findPowerBuyers(query: string, onEvent: (e: PBEvent) => void = () => {}): Promise<PowerBuyerResult> {
  const q = query.trim().slice(0, 200);
  if (!q) throw new Error("Type a boutique name, website or a London postcode.");
  const started = Date.now();
  const say = async (text: string) => { onEvent({ type: "progress", text }); await sleep(180); };

  // 1. Where is the boutique?
  onEvent({ type: "stage", stage: "locate", text: "Locating the boutique" });
  let name = q, site: string | null = null, store: Store | null = null, checks: HardChecks | null = null;
  let postcode: string;
  if (isPostcode(q)) {
    postcode = q.toUpperCase();
    name = `boutiques in ${areaOf(postcode)}`;
  } else {
    site = normaliseSite(q) ?? (await (async () => { await say(`Finding the website for “${q}”`); return guessSite(q, say); })());
    if (!site) throw new Error(`Couldn't find a website for “${q}”. Try the URL or a postcode (e.g. W1U 4AD).`);
    checks = await runHardChecks(site);
    if (!checks.reachable) throw new Error(`${site} blocked our request. Try typing the store's postcode instead.`);
    const f = await demoResearch(q, checks, say);
    name = f.brand;
    store = f.stores.find((s) => s.inZone) ?? f.stores[0] ?? null;
    if (!store) throw new Error(`${name} doesn't publish a London store address. Type the store's postcode instead.`);
    postcode = store.postcode;
    await say(`Using the ${store.address.split(",")[0]} store (${store.postcode})`);
  }
  const center = await geocode(postcode);
  if (!center) throw new Error(`Couldn't place ${postcode} on the map.`);
  const area = areaOf(postcode);
  onEvent({ type: "center", center, label: store ? `${name}, ${store.address.split(",")[0]}` : postcode });

  // 2. Who is around it?
  onEvent({ type: "stage", stage: "scan", text: `Scanning a 10-minute walk around ${store ? store.address.split(",")[0] : postcode}` });
  await say("Querying OpenStreetMap for hotels, members' clubs, venues and offices");
  const places: OsmPlace[] = await placesAround(center, 800, (m) => onEvent({ type: "progress", text: m }));
  await say(`${places.length} businesses found within 800 m`);

  const ranked = places
    .map((p) => {
      const c = classify(p.tags);
      if (!c) return null;
      const metres = Math.round(metresBetween(center, p));
      const t = p.tags;
      const addr = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") + (t["addr:postcode"] ? `, ${t["addr:postcode"]}` : "");
      return {
        id: p.id, name: t.name, kind: c.kind, kindLabel: KIND_LABEL[c.kind], detail: c.detail, address: addr, lat: p.lat, lng: p.lng,
        metres, walkMins: Math.max(1, Math.round(metres / 80)), stars: t.stars ?? null,
        website: t.website ?? t["contact:website"] ?? null, phone: t.phone ?? t["contact:phone"] ?? null,
        email: t.email ?? t["contact:email"] ?? null, emailSource: t.email || t["contact:email"] ? `https://www.openstreetmap.org/${p.id}` : null,
        osmUrl: `https://www.openstreetmap.org/${p.id}`, targetRole: ROLE[c.kind].role, why: ROLE[c.kind].why, score: score(c.kind, t, metres),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score);
  const byKind = { hotel: 0, club: 0, venue: 0, office: 0 } as Record<BuyerKind, number>;
  for (const r of ranked) byKind[r.kind]++;
  await say(`${byKind.hotel} hotels, ${byKind.club} clubs, ${byKind.venue} venues, ${byKind.office} offices`);

  // Keep a balanced shortlist: best of each kind, then fill by score
  const pick: typeof ranked = [];
  const quota: Record<BuyerKind, number> = { hotel: 6, club: 3, venue: 3, office: 3 };
  for (const r of ranked) if (quota[r.kind]-- > 0 && r.score > 0) pick.push(r);
  for (const r of ranked) if (pick.length < 12 && r.score > 0 && !pick.includes(r)) pick.push(r);
  pick.sort((a, b) => b.score - a.score);
  const shortlist = pick.slice(0, 12);

  // 3. Find public business inboxes
  onEvent({ type: "stage", stage: "contact", text: "Finding the right desk to contact" });
  for (const b of shortlist.slice(0, 8)) {
    if (b.email || !b.website) continue;
    await say(`Reading ${b.name}'s website for a ${b.kind === "hotel" ? "concierge" : b.kind === "venue" ? "events" : "front desk"} inbox`);
    const inbox = await findInbox(b.website, b.kind);
    if (inbox) { b.email = inbox.email; b.emailSource = inbox.source; await say(`Found ${inbox.email}`); }
  }

  // 4. Write outreach
  onEvent({ type: "stage", stage: "write", text: "Writing outreach" });
  const sample = checks?.prices?.sample.find((s) => s.price >= (checks?.prices?.median ?? 0));
  const ctx = {
    boutique: store ? name : "your favourite boutique",
    storeStreet: store ? store.address.split(",")[0].replace(/^\d+[-–\d]*\s+/, "") : area,
    area,
    product: sample ? `the ${sample.title.replace(/\s+/g, " ").replace(" - ", " in ")} (£${Math.round(sample.price)})` : null,
  };
  await say(`Writing ${shortlist.length} tailored emails and call scripts`);
  const buyers: PowerBuyer[] = shortlist.map((b) => ({ ...b, outreach: writeOutreach(b, ctx) }));

  const within5 = ranked.filter((r) => r.walkMins <= 5).length;
  const within10 = ranked.filter((r) => r.walkMins <= 10).length;
  const parts = [
    byKind.hotel && `${byKind.hotel} hotel${byKind.hotel > 1 ? "s" : ""}`,
    byKind.club && `${byKind.club} members' club${byKind.club > 1 ? "s" : ""}`,
    byKind.venue && `${byKind.venue} event venue${byKind.venue > 1 ? "s" : ""}`,
    byKind.office && `${byKind.office} offices`,
  ].filter(Boolean) as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "dozens of businesses";
  const proofLine = `Within a 10-minute walk of your ${ctx.storeStreet} store there are ${list}. [N] of them have already told us they'd use within-the-hour delivery from ${ctx.boutique}.`;

  return {
    kind: "powerbuyers", query: q,
    boutique: { name, site, store: store ? { address: store.address, postcode: store.postcode } : null, center, area },
    buyers, summary: { total: ranked.length, within5, within10, byKind }, proofLine,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}
