import { z } from "zod";

const Check = z.object({
  status: z.enum(["pass", "warn", "fail", "unknown"]),
  summary: z.string().describe("One short sentence a salesperson can read aloud."),
  source_url: z.string().describe("URL backing this, or empty string if from the hard checks."),
});

const Fact = z.object({
  fact: z.string().describe("A specific, verifiable fact about this boutique used in outreach."),
  source_url: z.string(),
});

const Contact = z.object({
  name: z.string().describe("Real person's name ONLY if found in a public source; otherwise empty string."),
  role: z.string().describe("Job title or target role, e.g. 'Head of E-commerce'."),
  why: z.string().describe("Why this person is the right door for Booster."),
  channel: z.string().describe("Best route: LinkedIn, general/press email found on site, store visit, etc."),
  email_guess: z.string().describe("Only a public email, or a pattern clearly labelled 'unverified pattern: ...'; else empty."),
  linkedin_url: z.string().describe("Public profile/search URL if found; else empty."),
  source_url: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  in_person: z.object({
    where: z.array(z.string()).describe("2-4 professional places/routes to meet them: the store, brand launches or trunk shows, industry events, a warm intro via a mutual LinkedIn connection. Never personal life or private social media."),
    opener: z.string().describe("A natural first line to say in person, grounded in a public, professional fact."),
    talking_points: z.array(z.string()).describe("2-3 points from public professional sources (brand news, their interviews, the store)."),
  }),
});

const OrgNode = z.object({
  id: z.string(),
  role: z.string(),
  name: z.string().describe("Only if a public source names them in this role; else empty."),
  reports_to: z.string().describe("id of the manager node, or empty for the top."),
  decides: z.string().describe("What this person decides that matters to Booster, e.g. 'checkout and shipping options'."),
  contact_index: z.number().int().describe("Index into contacts[] if this node is a recommended contact, else -1."),
  source_url: z.string(),
});

const Message = z.object({
  contact_index: z.number().int().describe("Index into contacts[] this is written for."),
  angle: z.string().describe("The emphasis for this person, e.g. 'checkout conversion'."),
  subject: z.string(),
  body: z.string(),
  linkedin_note: z.string().describe("Connection request note, max 300 characters."),
  facts_used: z.array(z.number().int()).describe("Indexes into facts[] referenced in this email."),
});

const FollowUp = z.object({
  day: z.number().int(),
  channel: z.enum(["email", "linkedin"]),
  subject: z.string(),
  body: z.string(),
});

const AfterYes = z.object({
  subject: z.string(),
  opening: z.string().describe("1-2 sentences thanking them for the yes, warm and brief."),
  gaps: z.array(z.string()).describe("2-4 respectful observations of gaps today, each grounded in a researched fact. Phrase as opportunities, never criticism."),
  scenario: z.object({
    monthly_orders_in_zone: z.number().describe("Assumed online orders per month to Booster districts. A round, conservative guess; it is labelled as an assumption."),
    uptake_pct: z.number().describe("Assumed % of those orders choosing within-the-hour."),
    extra_conversion_pct: z.number().describe("Assumed % uplift in checkout conversion for those visitors."),
    avg_item: z.number().describe("Average item price in GBP, from research (median price) if known."),
    fee: z.number().describe("Within-the-hour price shown to the customer, default 25."),
  }),
  mechanism_teaser: z.string().describe("2-3 sentences hinting at how Booster keeps the hour (checkout checks stock, postcode, rider) without giving everything away."),
  closing: z.string().describe("One clear next step, e.g. a 20-minute call to plug in their real numbers."),
});

export const ScoutReport = z.object({
  boutique: z.object({
    name: z.string(),
    website: z.string(),
    one_liner: z.string().describe("What they sell and for whom, in one line."),
    london_stores: z.array(
      z.object({ address: z.string(), postcode: z.string(), in_booster_zone: z.boolean() }),
    ),
  }),
  viability: z.object({
    verdict: z.enum(["go", "maybe", "no-go"]),
    headline: z.string().describe("One-sentence verdict reason."),
    shopify: Check,
    london_zone: Check,
    price_fit: Check,
    delivery_gap: Check,
    competitor: Check.describe("Do they already offer same-hour/same-day via Quiver, NIFT, Zapp, Gophr, Send247, own couriers?"),
  }),
  facts: z.array(Fact).describe("6-10 specific facts used for personalisation."),
  org: z.array(OrgNode).describe("Decision-maker hierarchy: who decides what, top-down. 5-9 nodes. Roles only unless publicly named."),
  contacts: z.array(Contact).describe("Exactly 3 recommended contacts ranked best first."),
  messages: z.array(Message).describe("One tailored first-touch message per top contact (2-3)."),
  follow_ups: z.array(FollowUp).describe("Day 3, 7 and 14 follow-ups for the top contact."),
  after_yes: AfterYes.describe("The email to send once the boutique replies yes: mini pitch with gaps, illustrative numbers and a mechanism teaser."),
});

export type ScoutReport = z.infer<typeof ScoutReport>;
