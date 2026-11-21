import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { BOOSTER_BRIEF, OUTREACH_PLAYBOOK } from "./booster.js";
import type { HardChecks } from "./checks.js";
import { ScoutReport } from "./schema.js";

const client = new Anthropic();
const MODEL = "claude-opus-5-5";
const BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];

export type Emit = (event: string, data: unknown) => void;

const RESEARCH_SYSTEM = `You are Booster Scout, a sales researcher for Booster, a London startup.
${BOOSTER_BRIEF}

Your job in this step: research ONE boutique using only public information and write a research dossier.
Find and cite (with URLs):
1. Official website, what they sell, typical price points, brand positioning.
2. Every London store address with full postcode. Say whether each postcode is in W1, SW1, WC or EC.
3. E-commerce platform (confirm Shopify or not) and their current UK delivery options, speeds and prices. Look for any same-day / within-hours service (Quiver, NIFT, Zapp, Gophr, Send247, Addison Lee, own couriers).
4. Recent news: launches, new stores, collaborations, press, gifting or seasonal moments from the last 12 months.
5. People: the best 2–4 contacts for a delivery pilot (Head of E-commerce/Digital, Founder/MD/CEO, Retail/Operations director, London store manager). Use LinkedIn search results, press articles, company "about" pages, and Companies House officers. Only name a person if a public source names them in that role; otherwise give the role only. Note any public business email (press@, hello@, wholesale@) found on their site.
Be efficient: aim for about 8–12 searches/fetches. Do not invent anything. End with a dossier in markdown with a "Sources" list.`;

const WRITER_SYSTEM = `You are Booster Scout. Turn a research dossier into a viability scorecard and a personalised outreach plan for Booster.
${BOOSTER_BRIEF}
${OUTREACH_PLAYBOOK}

Rules:
- Use only facts present in the dossier or hard checks. Every fact gets a source URL from the dossier (or empty string for hard-check facts).
- Verdict: "go" if on Shopify AND has a store in a Booster district AND price point makes £25 reasonable; "no-go" if not Shopify or no store in the zone; otherwise "maybe".
- If the verdict is "no-go", still write messages but make the ask appropriate (e.g. stay in touch for when Booster reaches their district / supports their platform).
- Never invent names, emails, stats, partners or quotes. Email guesses must be labelled "unverified pattern".
- British English. Write message bodies as plain text with line breaks.
- org + in_person: map who decides what (professional roles only). For in-person introductions use only professional, public context (the store, brand events, industry events, mutual LinkedIn connections, the person's public interviews). Never research or mention anyone's private life, family, hobbies or personal social media.
- Customer requests: if the input lists them, use that exact sentence in the e-commerce and founder emails and as the first after_yes gap. Never invent or round counts.
- after_yes: the email sent once the boutique says yes. Respectfully name the gaps you found (as opportunities, grounded in facts), set conservative scenario assumptions (they are shown to the reader as editable assumptions, never as Booster results), and tease the mechanism without revealing everything.`;

function describeTool(block: Anthropic.Beta.BetaContentBlock): string | null {
  if (block.type !== "server_tool_use") return null;
  const input = block.input as { query?: string; url?: string };
  if (block.name === "web_search" && input.query) return `Searching: ${input.query}`;
  if (block.name === "web_fetch" && input.url) return `Reading: ${input.url}`;
  return `Using ${block.name}`;
}

/** Step 0: when the user typed only a name, find the brand's official website. */
export async function findWebsite(name: string): Promise<string | null> {
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "low" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
    messages: [
      {
        role: "user",
        content: `What is the official UK e-commerce website of the brand/boutique "${name}" (London)? Reply with only the URL, nothing else.`,
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ");
  const m = text.match(/https?:\/\/[^\s)>"']+/);
  return m ? new URL(m[0]).origin : null;
}

/** Step 1: live web research with Claude's server-side web search + fetch. Returns a markdown dossier. */
export async function research(query: string, checks: HardChecks, emit: Emit): Promise<string> {
  const factsFromChecks = JSON.stringify(
    { ...checks, shippingPolicy: checks.shippingPolicy?.slice(0, 1500) ?? null },
    null,
    2,
  );
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Boutique to research: ${query}\n\nHard checks already run by our server (trust these):\n${factsFromChecks}`,
    },
  ];

  const urls = new Set<string>();
  for (let round = 0; round < 4; round++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: BETAS,
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: RESEARCH_SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 10, user_location: { type: "approximate", city: "London", country: "GB" } },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8, max_content_tokens: 12000 },
      ],
      messages,
    });
    stream.on("contentBlock", (block) => {
      const label = describeTool(block);
      if (label) emit("progress", { text: label });
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") throw new Error("Claude declined to research this request.");
    // Keep source URLs from search results so the writer can cite them
    for (const b of msg.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === "web_search_result") urls.add(`${r.title} — ${r.url}`);
      }
      if (b.type === "web_fetch_tool_result" && b.content.type === "web_fetch_result") urls.add(b.content.url);
    }
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      emit("progress", { text: "Still researching…" });
      continue;
    }
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return `${text}\n\n## All pages seen\n${[...urls].map((u) => `- ${u}`).join("\n")}`;
  }
  throw new Error("Research did not finish.");
}

/** Step 2: structured scorecard + outreach plan from the dossier. */
export async function write(query: string, checks: HardChecks, dossier: string, demand: string | null = null): Promise<ScoutReport> {
  const msg = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(ScoutReport) },
    system: WRITER_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Boutique: ${query}\n\n# Hard checks (from our server)\n${JSON.stringify(
          { ...checks, shippingPolicy: checks.shippingPolicy?.slice(0, 1500) ?? null },
          null,
          2,
        )}\n\n# Booster customer requests (real counts from opted-in shoppers)\n${demand ?? "None yet. Do not mention customer requests."}\n\n# Research dossier\n${dossier}`,
      },
    ],
  });
  if (msg.stop_reason === "refusal") throw new Error("Claude declined to write this outreach.");
  if (!msg.parsed_output) throw new Error("Could not parse Claude's report.");
  return msg.parsed_output;
}
