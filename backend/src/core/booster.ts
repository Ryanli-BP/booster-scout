// Everything Claude needs to know about Booster. Sourced from booster.earth (Nov 2026).

export const BOOSTER_BRIEF = `
# Booster — facts (public, from booster.earth)
- Within-the-hour delivery for London's luxury boutiques. Tagline: "Bought online at two. Opened at home by three."
- How it works: the shopper picks Booster at checkout; the order is packed at the brand's nearest London boutique in a sealed Booster bag and a self-employed rider (bike / e-bike) delivers it within the hour. Six-digit handover code at the door. If nobody answers, the sealed bag goes back to the boutique.
- Booster only shows at checkout when it can keep the promise: every item is in stock at the physical boutique, the delivery postcode is in a district the boutique serves, and a rider is nearby. Otherwise the shopper just sees the usual options.
- Coverage today (postcode districts): W1 (Mayfair, Marylebone, Soho), SW1 (St James's, Belgravia, Westminster), WC (Covent Garden, Holborn), EC (the City). Expanding one district at a time.
- Integration: on Shopify it appears as a carrier-calculated shipping rate next to existing options (included on Shopify Advanced and Plus; available on other plans with annual billing). Salesforce Commerce Cloud / custom platforms via API.
- In store: no new screens or training. Staff pack into a sealed Booster bag with a ticket.
- Onboarding is "a conversation": Booster sets up the boutique location, served districts and message routing, then switches the option on.
- Price shown in Booster's mock-up: "Delivered within the hour £25.00" next to Standard (free, 3–5 days) and Express (£15, next day). Prices are set by each brand.
- Stage: pre-launch, looking for its first pilot brands. NO named partners, NO stats, NO testimonials — never invent any.
- Founder background: started his career at BlackRock as a luxury investor (name not public — do not invent one).
- Contact: contact@booster.earth. CTA: "Talk to us about a pilot."

# Booster's voice
Calm, crafted, confident. Short sentences. Ordinary words, no logistics jargon ("last-mile", "fulfilment SLA", "leverage", "synergy" are banned). Speaks the language of luxury: the handover is "the first time the customer actually touches what they bought". "Your checkout, your boutique, your customer. We do the hour in between."

# Positioning angles
- Deal-closer: removes the one reason a customer hesitates on an expensive item online — waiting days for it. Keeps the indulgence of buying something special.
- Moments that need it now: a gift for tonight, a forgotten tie before a board meeting, an anniversary, a hotel guest leaving tomorrow.
- Low-risk pilot: one boutique, the districts it already sits in, a few weeks, brand sets the price.
`;

export const OUTREACH_PLAYBOOK = `
# Outreach playbook (benchmarks the team researched)
- Generic cold email averages ~3.4% reply. Advanced personalisation reaches ~18% vs ~9% for templates → every message must use at least 3 facts specific to this boutique (store street/postcode, a named product + price, their current delivery promise, a recent launch/event/press moment). No merge-field filler.
- Contact several people at the company (+93% response): write a tailored version for each of the top 2–3 contacts with a different emphasis — e-commerce/digital lead: checkout conversion and basket abandonment; founder/MD/brand: the customer experience and the brand's own standards; retail/store ops: no new screens, sealed bags, returns to the boutique.
- LinkedIn connection request WITH a personal note (9.36% vs 5.44% reply): max 300 characters, no pitch dump.
- 42% of replies come from follow-ups: plan Day 3 (new value: what Booster would look like at THEIR checkout, with a real product and price), Day 7 (a moment-it-matters use case), Day 14 (polite close-the-loop).
- Email rules: subject under 8 words, body under 130 words, one clear ask (a 15-minute call or "shall we switch it on for your <store> boutique for a few weeks?"), signed "— The Booster team, contact@booster.earth". No fake familiarity, no invented stats or partners.
`;
