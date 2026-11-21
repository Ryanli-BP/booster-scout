// Deterministic checks that run before Claude: is the site on Shopify, what do
// they charge, and what does their shipping policy promise today.

export interface PriceStats {
  currency: string | null;
  productCount: number;
  min: number;
  median: number;
  max: number;
  sample: { title: string; price: number; url: string }[];
}

export interface HardChecks {
  site: string | null;
  reachable: boolean;
  shopify: boolean;
  shopifySignals: string[];
  prices: PriceStats | null;
  shippingPolicy: string | null;
  notes: string[];
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export async function get(url: string, ms = 8000): Promise<Response | null> {
  try {
    return await fetch(url, {
      headers: { "user-agent": UA, accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
    });
  } catch {
    return null;
  }
}

/** Turn "aesop.com", "https://www.aesop.com/uk/", etc. into an origin. Returns null for plain names. */
export function normaliseSite(input: string): string | null {
  const s = input.trim();
  if (!/\.[a-z]{2,}/i.test(s) || /\s/.test(s)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.origin;
  } catch {
    return null;
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&pound;/g, "£")
    .replace(/\s+/g, " ")
    .trim();
}

export async function runHardChecks(siteInput: string | null): Promise<HardChecks> {
  const out: HardChecks = {
    site: siteInput,
    reachable: false,
    shopify: false,
    shopifySignals: [],
    prices: null,
    shippingPolicy: null,
    notes: [],
  };
  if (!siteInput) {
    out.notes.push("No website given; Claude will find it.");
    return out;
  }

  // 1. Home page: reachability + Shopify fingerprints
  const home = await get(siteInput);
  if (home && home.ok) {
    out.reachable = true;
    out.site = new URL(home.url).origin;
    const html = await home.text();
    if (/cdn\.shopify\.com/i.test(html)) out.shopifySignals.push("Loads assets from cdn.shopify.com");
    if (/Shopify\.shop\s*=|window\.Shopify/i.test(html)) out.shopifySignals.push("Shopify storefront script on page");
    if (home.headers.get("x-shopid") || home.headers.get("x-shopify-stage"))
      out.shopifySignals.push("Shopify response headers");
    if (/shopify-plus|Shopify Plus/i.test(html)) out.shopifySignals.push("Mentions Shopify Plus");
  } else {
    out.notes.push(`Home page not reachable (${home ? home.status : "timeout"}).`);
  }
  const origin = out.site ?? siteInput;

  // 2. Public product catalogue (only exists on Shopify stores)
  const pj = await get(`${origin}/products.json?limit=250`);
  if (pj && pj.ok && (pj.headers.get("content-type") ?? "").includes("json")) {
    try {
      const data = (await pj.json()) as {
        products?: { title: string; handle: string; variants?: { price: string }[] }[];
      };
      if (Array.isArray(data.products)) {
        out.shopifySignals.push("Public /products.json catalogue");
        const items = data.products
          .map((p) => {
            const prices = (p.variants ?? []).map((v) => parseFloat(v.price)).filter((n) => n > 0);
            return prices.length
              ? { title: p.title, price: Math.min(...prices), url: `${origin}/products/${p.handle}` }
              : null;
          })
          .filter((x): x is { title: string; price: number; url: string } => x !== null);
        if (items.length) {
          const sorted = [...items].sort((a, b) => a.price - b.price);
          const mid = sorted[Math.floor(sorted.length / 2)].price;
          // Representative sample around the median and the top end, for the email
          const sample = [
            ...sorted.slice(Math.floor(sorted.length / 2), Math.floor(sorted.length / 2) + 3),
            ...sorted.slice(-3),
          ].filter((v, i, a) => a.findIndex((x) => x.url === v.url) === i);
          out.prices = {
            currency: null,
            productCount: items.length,
            min: sorted[0].price,
            median: mid,
            max: sorted[sorted.length - 1].price,
            sample,
          };
        }
      }
    } catch {
      /* not JSON after all */
    }
  }
  out.shopify = out.shopifySignals.length > 0;

  // Currency hint from the cart endpoint (Shopify only)
  if (out.shopify && out.prices) {
    const cart = await get(`${origin}/cart.js`, 5000);
    if (cart && cart.ok) {
      try {
        const c = (await cart.json()) as { currency?: string };
        out.prices.currency = c.currency ?? null;
      } catch {
        /* ignore */
      }
    }
  }

  // 3. Shipping policy (Shopify standard path)
  if (out.shopify) {
    const sp = await get(`${origin}/policies/shipping-policy`);
    if (sp && sp.ok) {
      const text = htmlToText(await sp.text());
      out.shippingPolicy = text.slice(0, 4000);
    }
  }

  return out;
}
