// Demo-mode research: no API key needed. Reads the boutique's own public website
// (sitemap, store/contact/about pages, shipping policy) and extracts real facts.
import { get, htmlToText, normaliseSite, type HardChecks } from "./checks.js";

export interface Store { address: string; postcode: string; outward: string; inZone: boolean; source: string }
export interface Snippet { text: string; source: string }

export interface DemoFindings {
  brand: string;
  site: string | null;
  description: string | null;
  pagesRead: string[];
  stores: Store[];
  publicEmails: Snippet[];
  deliverySnippets: Snippet[];
  fastestDelivery: string | null;
  sameDay: Snippet | null;
  competitors: Snippet[];
  linkedinCompany: string | null;
  instagram: string | null;
}

type Say = (text: string) => Promise<void>;

const ZONE = /^(W1[A-Z]?|SW1[A-Z]?|WC[12][A-Z]?|EC[1-4][A-Z]?)$/;
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[ABD-HJLNP-UW-Z]{2})\b/g;
const LONDON_AREAS = /^(E|EC|N|NW|SE|SW|W|WC)\d/;
const COMPETITORS = /\b(Quiver|NIFT|Zapp|Gophr|Send247|Stuart|Addison Lee|Uber Direct|Deliveroo|Same[- ]day delivery|Same[- ]day courier|90[- ]minute delivery|within (?:the|an|one) hour)\b/i;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function page(url: string): Promise<{ url: string; html: string; text: string } | null> {
  const r = await get(url, 7000);
  if (!r || !r.ok || !(r.headers.get("content-type") ?? "").includes("html")) return null;
  const html = await r.text();
  return { url: r.url, html, text: htmlToText(html) };
}

function sentencesWith(text: string, re: RegExp, max = 3): string[] {
  return text
    .split(/(?<=[.!?])\s+|\s{2,}|•/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.length < 260 && re.test(s))
    .slice(0, max);
}

/** Guess the site from a brand name by trying common domains. */
export async function guessSite(name: string, say: Say): Promise<string | null> {
  const slug = name.toLowerCase().replace(/['’&]/g, "").replace(/[^a-z0-9]+/g, "");
  const candidates = [`${slug}.com`, `${slug}.co.uk`, `${slug}london.com`, `${slug}.london`, `${slug}.uk`];
  for (const c of candidates) {
    await say(`Trying ${c}`);
    const p = await page(`https://www.${c}`).then((x) => x ?? page(`https://${c}`));
    if (p) {
      const title = (p.html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (title.includes(slug.slice(0, Math.max(4, Math.min(slug.length, 8))))) return normaliseSite(p.url);
    }
  }
  return null;
}

export async function demoResearch(query: string, checks: HardChecks, say: Say): Promise<DemoFindings> {
  const f: DemoFindings = {
    brand: query, site: checks.site, description: null, pagesRead: [], stores: [], publicEmails: [],
    deliverySnippets: [], fastestDelivery: null, sameDay: null, competitors: [], linkedinCompany: null, instagram: null,
  };
  if (!checks.site || !checks.reachable) return f;
  const origin = checks.site;

  // Home page: brand name, description, social links
  await say(`Reading ${origin}`);
  const home = await page(origin);
  if (home) {
    f.pagesRead.push(home.url);
    const og = home.html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1];
    const title = home.html.match(/<title[^>]*>([^<|–—-]*)/i)?.[1]?.trim();
    f.brand = (og || title || query).replace(/&amp;/g, "&").replace(/[^\p{L}\p{N})'’.&]+$/u, "").replace(/^[^\p{L}\p{N}]+/u, "").trim() || query;
    f.description = home.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]?.replace(/&amp;/g, "&") ?? null;
    f.linkedinCompany = home.html.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/company\/[^"'\s?#<]+/i)?.[0] ?? null;
    f.instagram = home.html.match(/https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+/i)?.[0] ?? null;
    if (f.linkedinCompany) await say(`Found LinkedIn company page`);
  }

  // Sitemap → store / contact / about / delivery pages
  await say("Reading sitemap for store, contact and delivery pages");
  const wanted = /(store|stores|boutique|location|visit|find-us|contact|about|our-story|delivery|shipping)/i;
  const urls = new Set<string>();
  const sm = await get(`${origin}/sitemap.xml`, 6000);
  if (sm && sm.ok) {
    const xml = await sm.text();
    const pageMaps = [...xml.matchAll(/<loc>([^<]*sitemap_pages[^<]*)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    for (const pm of pageMaps.slice(0, 1)) {
      const r = await get(pm, 6000);
      if (r && r.ok) for (const m of (await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)) if (wanted.test(m[1])) urls.add(m[1].replace(/&amp;/g, "&"));
    }
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) if (wanted.test(m[1]) && !/sitemap/.test(m[1])) urls.add(m[1]);
  }
  for (const p of ["/pages/stores", "/pages/our-stores", "/pages/store-locator", "/pages/contact", "/pages/about", "/policies/contact-information"])
    urls.add(origin + p);
  const toRead = [...urls].sort((a, b) => Number(/store|boutique|location|visit/i.test(b)) - Number(/store|boutique|location|visit/i.test(a))).slice(0, 9);

  const texts: { url: string; text: string }[] = home ? [{ url: home.url, text: home.text }] : [];
  for (const u of toRead) {
    const p = await page(u);
    if (!p || f.pagesRead.includes(p.url)) continue;
    await say(`Reading ${p.url.replace(origin, "") || "/"}`);
    f.pagesRead.push(p.url);
    texts.push({ url: p.url, text: p.text });
  }
  if (checks.shippingPolicy) texts.push({ url: `${origin}/policies/shipping-policy`, text: checks.shippingPolicy });

  // Extract: London stores (postcodes)
  await say("Extracting store addresses and postcodes");
  const seen = new Set<string>();
  for (const { url, text } of texts) {
    for (const m of text.matchAll(POSTCODE)) {
      const outward = m[1].toUpperCase();
      const postcode = `${outward} ${m[2].toUpperCase()}`;
      if (!LONDON_AREAS.test(outward) || seen.has(postcode)) continue;
      seen.add(postcode);
      const before = (text.slice(Math.max(0, (m.index ?? 0) - 80), m.index).split(/\s{2,}|\||Read more|View store|Directions/i).pop() ?? "")
        .replace(/,?\s*London,?\s*$/i, "").trim();
      // Start the address at the street number if there is one ("27 Marylebone High St")
      const fromNumber = before.match(/(\d{1,4}(?:[-–]\d{1,4})?[A-Za-z]?\s+[A-Z][\w'’ .,&-]*)$/)?.[1];
      const address = (fromNumber ?? before.replace(/^[^A-Za-z0-9]*/, "").split(/\.\s/).pop() ?? "")
        .replace(/\s+/g, " ")
        // Drop a trailing neighbourhood label that store pages tack on ("27 Marylebone High St Marylebone")
        .replace(/\s+(Marylebone|Mayfair|Soho|Carnaby|Chelsea|Notting Hill|Covent Garden|Belgravia|Knightsbridge|Fitzrovia|Westminster|St James's|Holborn|Shoreditch|Kensington)$/i, "")
        .trim();
      f.stores.push({ address: address ? `${address}, London` : "London", postcode, outward, inZone: ZONE.test(outward), source: url });
    }
  }
  f.stores.sort((a, b) => Number(b.inZone) - Number(a.inZone));
  if (f.stores.length) await say(`Found ${f.stores.length} London postcode${f.stores.length > 1 ? "s" : ""}: ${f.stores.map((s) => s.postcode).join(", ")}`);
  else await say("No London store postcode published on the site");

  // Extract: delivery promise, same-day / competitors, public emails
  await say("Reading delivery promise and checking for same-day partners");
  const emailSeen = new Set<string>();
  for (const { url, text } of texts) {
    for (const s of sentencesWith(text, /(next[- ]day|working days?|business days?|express|standard delivery|same[- ]day|delivered within)/i, 4))
      if (!f.deliverySnippets.some((d) => d.text === s)) f.deliverySnippets.push({ text: s, source: url });
    const c = sentencesWith(text, COMPETITORS, 1)[0];
    if (c && !f.competitors.some((x) => x.text === c)) f.competitors.push({ text: c, source: url });
    for (const m of text.matchAll(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi)) {
      const e = m[0].toLowerCase();
      if (/(example|sentry|wixpress|shopify|domain)\./.test(e) || emailSeen.has(e)) continue;
      emailSeen.add(e);
      f.publicEmails.push({ text: e, source: url });
    }
  }
  f.deliverySnippets = f.deliverySnippets.slice(0, 6);
  f.sameDay = f.deliverySnippets.find((d) => /same[- ]day|within (the|an|one) hour|90[- ]minute/i.test(d.text)) ?? f.competitors[0] ?? null;
  const all = f.deliverySnippets.map((d) => d.text).join(" ");
  f.fastestDelivery = /same[- ]day/i.test(all) ? "same day" : /next[- ](working[- ])?day/i.test(all) ? "the next working day" : /1[-–]2 (working |business )?days/i.test(all) ? "in 1–2 working days" : /2[-–]3 (working |business )?days/i.test(all) ? "in 2–3 working days" : /3[-–]5 (working |business )?days/i.test(all) ? "in 3–5 working days" : null;
  if (f.fastestDelivery) await say(`Fastest delivery offered today: ${f.fastestDelivery}`);
  if (f.publicEmails.length) await say(`Found public inbox: ${f.publicEmails.map((e) => e.text).slice(0, 3).join(", ")}`);
  await say("Building contact map");
  return f;
}
