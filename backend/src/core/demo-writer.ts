// Demo-mode writer: builds the same ScoutReport as live mode, from real extracted
// facts plus Booster-voice templates. No AI, nothing invented.
import type { HardChecks } from "./checks.js";
import type { DemoFindings } from "./demo-research.js";
import type { ScoutReport } from "./schema.js";

const AREA: Record<string, string> = {
  W1J: "Mayfair", W1K: "Mayfair", W1S: "Mayfair", W1B: "Regent Street", W1C: "Oxford Street", W1D: "Soho", W1F: "Soho",
  W1G: "Marylebone", W1H: "Marylebone", W1U: "Marylebone", W1T: "Fitzrovia", W1W: "Fitzrovia",
  SW1A: "St James's", SW1Y: "St James's", SW1X: "Belgravia", SW1W: "Belgravia", SW1P: "Westminster", SW1H: "Westminster", SW1E: "Victoria", SW1V: "Pimlico",
  WC1: "Bloomsbury and Holborn", WC2: "Covent Garden", EC: "the City",
};
const areaOf = (outward: string) =>
  AREA[outward] ?? AREA[outward.slice(0, 3)] ?? AREA[outward.slice(0, 2)] ?? "central London";
const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const liSearch = (q: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`;

export function demoWrite(f: DemoFindings, checks: HardChecks, demand: string | null = null): ScoutReport {
  const brand = f.brand;
  const zoneStore = f.stores.find((s) => s.inZone) ?? null;
  const p = checks.prices && {
    ...checks.prices,
    sample: checks.prices.sample.map((s) => ({ ...s, title: s.title.replace(/\s+/g, " ").trim() })),
  };
  const hero = p ? (p.sample.find((s) => s.price >= p.median) ?? p.sample[0]) : null;
  const statement = p ? (p.sample[p.sample.length - 1] ?? null) : null;
  const share = p ? Math.round((25 / p.median) * 100) : null;
  const fastest = f.fastestDelivery;
  const where = zoneStore ? `${zoneStore.address.split(",")[0]} (${zoneStore.postcode})` : null;

  // ---- Facts (each one is something we actually read) ----
  const facts: ScoutReport["facts"] = [];
  const fact = (text: string, source = "") => (facts.push({ fact: text, source_url: source }), facts.length - 1);
  const fStore = zoneStore ? fact(`London boutique at ${zoneStore.address} ${zoneStore.postcode}, inside Booster's ${zoneStore.outward} district.`, zoneStore.source) : -1;
  const fHero = hero ? fact(`Sells the ${hero.title} at ${gbp(hero.price)}.`, hero.url) : -1;
  const fMedian = p ? fact(`Median price across ${p.productCount} products is ${gbp(p.median)}; £25 delivery is ${share}% of that.`) : -1;
  const fDelivery = f.deliverySnippets[0] ? fact(`Current delivery promise: “${f.deliverySnippets[0].text}”`, f.deliverySnippets[0].source) : -1;
  const fStatement = statement && statement !== hero ? fact(`Top of the range: ${statement.title} at ${gbp(statement.price)}.`, statement.url) : -1;
  const fShopify = checks.shopify ? fact(`Runs on Shopify (${checks.shopifySignals[0]?.toLowerCase() ?? "storefront detected"}).`) : -1;
  if (f.description) fact(`Describes itself as: “${f.description.slice(0, 160)}”`, f.site ?? "");
  for (const s of f.stores.filter((s) => s !== zoneStore).slice(0, 2)) fact(`Also has a London address at ${s.address} ${s.postcode}${s.inZone ? " (in zone)" : " (outside current Booster districts)"}.`, s.source);
  const fDemand = demand ? fact(`Booster customer requests: ${demand}`) : -1;
  const used = (...ix: number[]) => ix.filter((i) => i >= 0);

  // ---- Viability ----
  const inZone = Boolean(zoneStore);
  const verdict: ScoutReport["viability"]["verdict"] = !checks.shopify || (!inZone && f.stores.length > 0) ? "no-go" : inZone && p && p.median >= 100 ? "go" : "maybe";
  const viability: ScoutReport["viability"] = {
    verdict,
    headline:
      verdict === "go" ? `On Shopify, a boutique in ${zoneStore!.outward}, and a ${gbp(p!.median)} median item: £25 for the hour is an easy yes for a customer.`
      : verdict === "no-go" ? (!checks.shopify ? "Not on Shopify, so Booster can't switch on at checkout yet (API route only)." : "No London boutique inside Booster's current districts.")
      : !inZone ? "On Shopify, but no store postcode published inside Booster's districts. Confirm where they pack from." : "Worth a conversation; price point is lower than ideal for a £25 option.",
    shopify: { status: checks.shopify ? "pass" : "fail", summary: checks.shopify ? `Shopify storefront (${checks.shopifySignals.length} signals).` : "No Shopify signals found.", source_url: "" },
    london_zone: inZone
      ? { status: "pass", summary: `${zoneStore!.address.split(",")[0]}, ${zoneStore!.postcode}: ${areaOf(zoneStore!.outward)}.`, source_url: zoneStore!.source }
      : f.stores.length ? { status: "fail", summary: `London postcodes found (${f.stores.map((s) => s.outward).join(", ")}) are outside W1/SW1/WC/EC.`, source_url: f.stores[0].source }
      : { status: "unknown", summary: "No store postcode published on their site.", source_url: "" },
    price_fit: p
      ? { status: p.median >= 150 ? "pass" : p.median >= 60 ? "warn" : "fail", summary: `Median item ${gbp(p.median)}; £25 is ${share}% of it.`, source_url: "" }
      : { status: "unknown", summary: "No public product catalogue to price.", source_url: "" },
    delivery_gap: fastest
      ? { status: fastest === "same day" ? "warn" : "pass", summary: `Fastest option today arrives ${fastest}.`, source_url: f.deliverySnippets[0]?.source ?? "" }
      : { status: "unknown", summary: "Delivery times not stated on the pages read.", source_url: "" },
    competitor: f.sameDay
      ? { status: "warn", summary: `Mentions faster delivery: “${f.sameDay.text.slice(0, 110)}”`, source_url: f.sameDay.source }
      : { status: "pass", summary: "No same-hour partner (Quiver, NIFT, Zapp…) mentioned on their site.", source_url: "" },
  };

  // ---- Contacts (roles + where to find them; no invented names) ----
  const inbox = f.publicEmails.find((e) => /^(hello|info|contact|enquiries|customercare|customer|press|pr|wholesale|partnerships)/.test(e.text)) ?? f.publicEmails[0];
  // In-person routes use only professional, public context: the store, brand
  // events, industry events, mutual connections. Never anyone's private life.
  const street = zoneStore ? zoneStore.address.split(",")[0] : null;
  const heroShort = hero ? `the ${hero.title.split(" - ")[0]}` : "a piece from your collection";
  const desc = f.description ? f.description.split(/[.!]/)[0].slice(0, 90) : null;
  const zoneStores = f.stores.filter((s) => s.inZone);
  const contacts: ScoutReport["contacts"] = [
    {
      name: "", role: "Head of E-commerce / Digital", why: "Owns the checkout and shipping rates; Booster is one more carrier option for them to switch on.", channel: "LinkedIn, then email", email_guess: "", linkedin_url: liSearch(`${brand} ecommerce`), source_url: f.linkedinCompany ?? "", confidence: "medium",
      in_person: {
        where: [
          `A warm introduction: look on LinkedIn for a mutual connection with ${brand}'s e-commerce team and ask them to introduce you`,
          `UK retail and e-commerce events where digital leads go (for example Retail Week Live or Shoptalk Europe); check the speaker and attendee lists for ${brand}`,
          "London Shopify partner and ecommerce meet-ups",
        ],
        opener: `“I was looking at ${heroShort} on your site: the fastest option is ${fastest ?? "not same-day"}${street ? `, even though you have a store on ${street}` : ""}. We’re working on that hour.”`,
        talking_points: [
          fastest ? `Their fastest delivery today is ${fastest}.` : "No same-day option at checkout today.",
          p ? `£25 is ${share}% of their ${gbp(p.median)} median item.` : "The brand sets the price of the hour.",
          checks.shopify ? "It installs as a Shopify carrier option: no development work." : "It connects through a simple API.",
        ],
      },
    },
    {
      name: "", role: "Founder / Managing Director", why: "Cares most about how the brand feels at the moment the customer opens the bag.", channel: inbox ? "Public inbox, marked for their attention" : "LinkedIn", email_guess: inbox?.text ?? "", linkedin_url: liSearch(`${brand} founder`), source_url: inbox?.source ?? f.linkedinCompany ?? "", confidence: "low",
      in_person: {
        where: [
          `${brand}'s own events: store openings, launches and trunk shows announced on their site and Instagram`,
          `Your network: ask whether anyone you know has worked with ${brand} and could introduce you`,
          "London fashion and retail panels where founders speak; read or watch their public interviews first",
        ],
        opener: desc
          ? `“You describe ${brand} as ‘${desc}’. The moment a customer opens the bag is part of that, and today it happens a day later.”`
          : `“The moment a customer opens the bag is part of the ${brand} experience, and today it happens a day later.”`,
        talking_points: [
          "The handover is the first time the customer touches what they bought.",
          zoneStores.length > 1 ? `${zoneStores.length} of their London stores are already inside Booster's districts.` : "Booster starts with one store and the districts around it.",
          "A short pilot from one store, at a price the brand sets.",
        ],
      },
    },
    {
      name: "", role: zoneStore ? `Store Manager, ${street}` : "Head of Retail Operations", why: "Would pack the sealed bags. Needs to hear: no new screens, no training, unanswered deliveries come back to the store.", channel: zoneStore ? "Walk in to the boutique with a one-page leave-behind" : "LinkedIn", email_guess: "", linkedin_url: liSearch(`${brand} retail operations`), source_url: zoneStore?.source ?? "", confidence: "medium",
      in_person: {
        where: [
          zoneStore ? `Walk in to ${zoneStore.address} ${zoneStore.postcode} on a weekday morning, when the shop floor is quiet` : `Visit ${brand}'s nearest London store on a weekday morning`,
          "Bring a sealed Booster bag and a one-page leave-behind to show, not tell",
          "Ask for the store manager by role; don't pitch to staff serving customers",
        ],
        opener: "“Could I show you something that takes two minutes and adds nothing to your till?”",
        talking_points: [
          "Orders come through as normal; staff pack one sealed bag with a ticket.",
          "A rider collects within minutes; if nobody answers the door, the bag comes back to the store.",
          street ? `Customers a few streets from ${street} get it within the hour.` : "Nearby customers get it within the hour.",
        ],
      },
    },
  ];

  // ---- Decision-maker map (typical structure for a boutique brand; roles only) ----
  const org: ScoutReport["org"] = [
    { id: "lead", role: "Founder / Managing Director", name: "", reports_to: "", decides: "Brand standards, budget and new partners", contact_index: 1, source_url: f.linkedinCompany ?? "" },
    { id: "ecom", role: "Head of E-commerce / Digital", name: "", reports_to: "lead", decides: "Checkout and shipping options", contact_index: 0, source_url: "" },
    { id: "retail", role: "Head of Retail / Operations", name: "", reports_to: "lead", decides: "Store processes and staffing", contact_index: zoneStore ? -1 : 2, source_url: "" },
    { id: "finance", role: "Finance Director", name: "", reports_to: "lead", decides: "Delivery costs and margins", contact_index: -1, source_url: "" },
    { id: "ecom-mgr", role: "E-commerce Manager", name: "", reports_to: "ecom", decides: "Runs the Shopify store day to day", contact_index: -1, source_url: "" },
    ...zoneStores.slice(0, 3).map((s, i) => ({
      id: `store-${i}`, role: `Store Manager, ${s.address.split(",")[0]}`, name: "", reports_to: "retail",
      decides: "Packing and handover in store", contact_index: s === zoneStore ? 2 : -1, source_url: s.source,
    })),
  ];

  // ---- Messages ----
  const heroLine = hero ? `the ${hero.title} (${gbp(hero.price)})` : "something from your new collection";
  const nowLine = fastest ? `arrives ${fastest}` : "won't be in their hands this afternoon";
  const checkoutLine = checks.shopify
    ? "Booster is a carrier option on your Shopify checkout."
    : "Booster plugs into your checkout through a simple API (Salesforce Commerce Cloud and custom platforms included).";
  const storeLine = where ? `your ${where} boutique` : "your London boutique";
  const sign = "\n\n— The Booster team\ncontact@booster.earth";

  const messages: ScoutReport["messages"] = [
    {
      contact_index: 0,
      angle: "checkout conversion",
      subject: `${hero ? hero.title.split(" - ")[0] : brand}, delivered by three`,
      body: `Hello,\n\nIf a customer in ${zoneStore ? areaOf(zoneStore.outward) : "central London"} buys ${heroLine} at lunchtime today, it ${nowLine}. That wait is when people close the tab.\n\n${checkoutLine} It only appears when the item is in stock at ${storeLine}, the postcode is covered and a rider is close. Bought online at two, opened at home by three.\n\n${demand ? `Your customers are already asking: ${demand}\n\n` : ""}${p ? `With a median item of ${gbp(p.median)}, £25 for the hour is ${share}% of the basket, and you set the price.` : "You set the price."} Could we switch it on for a few weeks and watch what it does to conversion?${sign}`,
      linkedin_note: `Hi, I noticed ${brand}'s fastest delivery today is ${fastest ?? "not same-day"}${where ? ` while your ${zoneStore!.postcode} boutique is minutes from most customers` : ""}. Booster adds a within-the-hour option to your checkout. Worth a short chat?`.slice(0, 300),
      facts_used: used(fStore, fHero, fMedian, fDelivery, fDemand),
    },
    {
      contact_index: 1,
      angle: "the brand experience",
      subject: `The hour after someone buys from ${brand}`,
      body: `Hello,\n\nLuxury brands design every part of buying something, apart from the wait. The handover is the first time your customer actually touches what they bought${statement ? `, whether that's a ${gbp(statement.price)} ${statement.title.split(" - ")[0]} or a last-minute gift` : ""}.\n\nBooster delivers from ${storeLine} within the hour, in a sealed bag, by a rider who hands it over with a code. Your checkout, your boutique, your customer. We just do the hour in between.\n\n${demand ? `${demand} ` : ""}We are choosing our first pilot brands in London and ${brand} is the kind of boutique we built this for. Would you be open to 15 minutes this week?${sign}`,
      linkedin_note: `Hello, Booster delivers London boutique orders within the hour in a sealed bag, straight from the store. ${brand}${where ? ` with ${storeLine}` : ""} is exactly who we built it for. Would love to show you.`.slice(0, 300),
      facts_used: used(fStore, fStatement, fHero, fDemand),
    },
    {
      contact_index: 2,
      angle: "easy for the store",
      subject: `${zoneStore ? zoneStore.address.split(",")[0] : brand}: no new screens, no training`,
      body: `Hello,\n\nA quick one for whoever runs ${storeLine}. Booster lets online customers nearby get their order within the hour, packed by your team.\n\nWhat changes in store: an order comes through, you pack it in a sealed Booster bag with a ticket, a rider collects it. No new screens or training. If nobody answers the door, the bag comes straight back to you.\n\nWe would love to pop in for ten minutes and show you the bag. When is quietest?${sign}`,
      linkedin_note: `Hi, Booster lets online customers near ${storeLine} get their order within the hour. Packing is one sealed bag, no new screens. Happy to pop in and show you.`.slice(0, 300),
      facts_used: used(fStore, fShopify),
    },
  ];

  const follow_ups: ScoutReport["follow_ups"] = [
    { day: 3, channel: "email", subject: `Re: ${messages[0].subject}`, body: `Hello again,\n\nHere's how it would look at your checkout for ${heroLine}:\n\n  Standard: ${fastest ?? "3–5 working days"}\n  Booster: delivered within the hour, £25\n\nIt only shows when it's in stock at ${storeLine} and we can keep the promise. Shall I set up a test on a staging store?${sign}` },
    { day: 7, channel: "linkedin", subject: "", body: `One more thought: the customer buying a gift at 5pm for a dinner at 8, or the forgotten tie before a 9am board meeting. Those are the orders you don't get today. Booster turns them into "delivered by six".` },
    { day: 14, channel: "email", subject: `Closing the loop, ${brand}`, body: `Hello,\n\nI don't want to crowd your inbox, so this is my last note for now. If within-the-hour delivery from ${storeLine} becomes interesting, perhaps before the Christmas rush, just reply and we'll switch it on.${sign}` },
  ];

  // ---- After they say yes: mini pitch ----
  const gaps: string[] = [];
  if (demand) gaps.push(`Demand is already there, unmet: ${demand}`);
  const near = zoneStore ? `a few streets from your ${zoneStore.address.split(",")[0]} boutique` : "in central London";
  gaps.push(
    fastest
      ? `Today, a customer ${near} who buys ${heroLine} online receives it ${fastest}, even though it may be sitting on a rail minutes away.`
      : `Today, online orders and the stock sitting in your boutique don't meet: a customer ${near} still waits for the warehouse.`,
  );
  if (!f.sameDay)
    gaps.push("There's no same-day option at checkout, so the 'I need it tonight' moments (a gift, a dinner, an event) tend to go to whoever can deliver today.");
  const inZoneCount = f.stores.filter((s) => s.inZone).length;
  if (inZoneCount > 1)
    gaps.push(`${inZoneCount} of your London stores sit inside districts where an hour is realistic. That's an unusually strong position, and today it works for walk-ins only.`);
  if (p && share !== null)
    gaps.push(`With a median item of ${gbp(p.median)}, the jump from 'tomorrow' to 'tonight' adds about ${share}% to the basket, a premium your customers already pay for taxis and couriers.`);

  const after_yes: ScoutReport["after_yes"] = {
    subject: `${brand} × Booster: what the hour could look like`,
    opening: `Thank you for coming back to us. Before we speak, here is a short picture of where we think within-the-hour delivery could help ${brand}, and how.`,
    gaps: gaps.slice(0, 4),
    scenario: {
      monthly_orders_in_zone: 200,
      uptake_pct: 5,
      extra_conversion_pct: 2,
      avg_item: p ? Math.round(p.median) : 250,
      fee: 25,
    },
    mechanism_teaser:
      "Without giving the whole recipe away: in the moment a customer reaches your checkout, Booster checks three things (the item is in your boutique, their postcode is one we cover, and a rider is close). Only when all three are true does the option appear. That's how we can promise the hour, and why your team never needs a new screen.",
    closing: `Could we take 20 minutes next week to replace our guesses with your real numbers? We'd then suggest a short pilot from ${zoneStore ? `your ${zoneStore.address.split(",")[0]} store` : "one boutique"}.`,
  };

  return {
    after_yes,
    boutique: {
      name: brand,
      website: f.site ?? "",
      one_liner: f.description?.slice(0, 180) ?? `${brand}${p ? `: ${p.productCount}+ products from ${gbp(p.min)} to ${gbp(p.max)}` : ""}.`,
      london_stores: f.stores.slice(0, 5).map((s) => ({ address: s.address, postcode: s.postcode, in_booster_zone: s.inZone })),
    },
    viability,
    facts,
    org,
    contacts,
    messages,
    follow_ups,
  };
}

export function demoDossier(f: DemoFindings, checks: HardChecks): string {
  const lines = [
    `# ${f.brand} (demo research: public website only)`,
    `Site: ${f.site ?? "not found"} · Shopify: ${checks.shopify ? "yes" : "no"}`,
    "",
    "## London addresses",
    ...(f.stores.length ? f.stores.map((s) => `- ${s.address} ${s.postcode} ${s.inZone ? "(in Booster zone)" : ""} [${s.source}]`) : ["- none published"]),
    "",
    "## Delivery promise",
    ...(f.deliverySnippets.length ? f.deliverySnippets.map((d) => `- “${d.text}” [${d.source}]`) : ["- not stated"]),
    "",
    "## Same-day / competitor mentions",
    ...(f.competitors.length ? f.competitors.map((d) => `- “${d.text}” [${d.source}]`) : ["- none"]),
    "",
    "## Public inboxes",
    ...(f.publicEmails.length ? f.publicEmails.map((e) => `- ${e.text} [${e.source}]`) : ["- none"]),
    "",
    "## Pages read",
    ...f.pagesRead.map((u) => `- ${u}`),
  ];
  return lines.join("\n");
}
