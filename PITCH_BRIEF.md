# Booster Scout: pitch-deck brief

> **For Claude:** this document is the source material for a pitch deck about Booster Scout. Use only the facts here. Figures marked *illustrative* are assumptions and must be labelled as such on any slide. Booster has no partners, customers or results yet; never imply otherwise. A suggested slide outline is at the end.

---

## 1. The challenge

Competition brief, set for Booster:

> "Type in a company, research it, make sure it is viable, find the right person and write a personalised email that gets them to try Booster's delivery within the hour."

## 2. Booster in one minute (public facts, booster.earth)

- **What:** within-the-hour delivery for London's luxury boutiques. *"Bought online at two. Opened at home by three."*
- **How:** shopper picks Booster at checkout → order packed at the brand's nearest London boutique in a sealed Booster bag → self-employed rider (bike / e-bike) delivers within the hour → six-digit handover code at the door. If nobody answers, the sealed bag goes back to the boutique.
- **Only shown when the promise can be kept:** item in stock at the boutique, postcode in a served district, rider nearby.
- **Coverage today:** W1 (Mayfair, Marylebone, Soho), SW1 (St James's, Belgravia, Westminster), WC (Covent Garden, Holborn), EC (the City).
- **Integration:** Shopify carrier-calculated rate (Advanced/Plus, or annual billing on other plans); API for Salesforce Commerce Cloud / custom platforms. No new screens or training in store.
- **Price:** £25 shown in Booster's own mock-up; each brand sets its price.
- **Stage:** pre-launch, looking for first pilot brands. Founder started at BlackRock as a luxury investor.

## 3. The problem Scout solves

Booster has to win its first boutiques with **no logos, no stats and no testimonials**. Generic sales tools don't fit:

- Average cold email reply rate is ~3.4% (down from ~5% in 2025 and 8.5% in 2019). *(Smartreach)*
- Tools like Apollo, Clay, Lemlist and "AI SDRs" are built for B2B software buyers, not Bond Street boutiques.
- Without proof, the only credible substitute is **research so specific the boutique can tell we've done our homework**, plus **demand from people the boutique already cares about**.

## 4. The product: Booster Scout

A web app plus a reusable API that turns one boutique name into a researched, multi-person, multi-step outreach plan. It has two directions.

### A. Boutique pitch (top-down)

Type a boutique name or website → in ~8 seconds:

1. **Storefront check (no AI):** detects Shopify, reads the public product catalogue (product count, median and range of prices), and reads the shipping policy.
2. **Research:** reads the boutique's own site (sitemap, store, contact and delivery pages) and extracts London store addresses and postcodes, the current delivery promise, any same-day competitor mentions, and public business inboxes.
3. **Viability scorecard:** Go / Maybe / No-go, with five checks: Shopify · in a Booster district · price fit · delivery gap · competitors. Every check links to its source.
4. **Who to talk to:** 3 role-based contacts (Head of E-commerce, Founder/MD, Store Manager), each with a LinkedIn search link and a reason why they're the right door. No invented names.
5. **Personalisation facts:** 6–10 sourced facts (store address, a named product and price, the current delivery promise…). Each email highlights which facts it uses.
6. **Outreach:** a tailored first email for each contact (checkout conversion · brand experience · easy for the store), a LinkedIn note of 300 characters or fewer for each, and Day 3 / 7 / 14 follow-ups.
7. **After they say yes (mini pitch):** a second email that names the gaps respectfully, shows *illustrative* numbers from an editable calculator, and teases how Booster works without giving it all away.

### B. Power buyers (bottom-up, "customer pull")

Type a boutique (or a postcode) → Scout maps the **businesses within a 10-minute walk that buy luxury on someone else's behalf**:

- **Hotel concierges:** guests need a dress, gift or cufflinks *tonight*.
- **Members' clubs:** "anything within the hour" is the culture.
- **Event venues and planners:** last-minute emergencies on event days.
- **Offices with PA teams:** client gifts, the forgotten tie before a 9am board meeting.

For each one: distance and walking time, star rating, website, public phone or inbox (read from their own site), the role to ask for, a tailored email, **a 20-second call script for the front desk**, and one clear ask: *"Can we tell [boutique] that [hotel] would use it?"*, plus early access. These businesses are shown on a live map around the boutique.

Their yeses become proof for the boutique pitch:

> "Within a 10-minute walk of your Marylebone High St store there are 48 hotels and 1 office. [N] of them have already told us they'd use within-the-hour delivery from RIXO."

**Why this approach (and not emailing shoppers):** contacting private individuals without consent breaks UK GDPR and PECR rules on electronic marketing, and it would feel invasive to a luxury customer. Power buyers are businesses with public business contact details. They spend more, feel the "need it now" pain most often, and boutiques listen to them.

## 5. Worked example: RIXO (real output, demo mode)

**Boutique pitch, rixolondon.com, 8 seconds**
- Verdict **GO**: "On Shopify, a boutique in W1U, and a £225 median item: £25 for the hour is an easy yes for a customer."
- Shopify confirmed (3 signals); 250 products, **median £225**, range £25–£925; £25 is **11%** of a median item.
- London stores found on their site: 27 Marylebone High St **W1U 4AD**, 44 Carnaby St **W1F 9PS**, 210–220 Regent Street **W1B 5AH** (all in zone); King's Rd **SW3**, Westbourne Grove **W11** (outside).
- Current fastest delivery: **next working day**. No same-hour partner mentioned on their site.
- First email opens: *"If a customer in Marylebone buys the Gabriel - Nina Leopard Mocha (£225) at lunchtime today, it arrives the next working day. That wait is when people close the tab."*

**Contrast (correct No-gos):** ME+EM, Penhaligon's and Mulberry are flagged "not on Shopify" (API route only). Mulberry has stores in zone (Curzon St W1J, Liverpool St EC2M), so it's a good later API prospect.

**Power buyers around RIXO Marylebone, 32 seconds**
- 49 businesses within 800 m; 47 within a 10-minute walk; 11 within 5 minutes.
- Top of the shortlist: Marylebone Hotel ★★★★ (3 min), The Langham ★★★★★ (8 min), The Mandeville Hotel ★★★★ (4 min, public inbox found), Holmes Hotel ★★★★ (5 min), Hyatt Regency The Churchill ★★★★★ (8 min), Ten Manchester Street ★★★★ (2 min).

**After-yes mini pitch, *illustrative* numbers (default assumptions, editable live)**
- Assume 200 online orders/month go to Booster postcodes and 5% choose the hour → **10 orders/month within the hour, £250 paid at checkout** (at £25).
- Assume a 2% conversion lift for those visitors → **~4 extra orders ≈ £900/month in sales** at a £225 average item.
- Stated in the email: *"These are our assumptions, not results. Booster is new, and we'd measure the real numbers with you during a pilot."*

## 6. Why it should convert (benchmarks the team researched)

| Lever | Benchmark | Source |
|---|---|---|
| Advanced personalisation | ~18% reply vs ~9% for generic templates | Martal |
| Multi-threading (several people per company) | +93% response rate | Martal |
| LinkedIn request **with** a note | 9.36% reply vs 5.44% without | Prospeo |
| Follow-ups | 42% of replies come from follow-ups | Overloop |
| Baseline cold email | ~3.4% average reply | Smartreach |

Scout builds every one of these in: at least 3 sourced facts per email, 3 contacts per boutique, a LinkedIn note for each, a Day 3/7/14 sequence, and the after-yes mini pitch.

## 7. Principles (worth a slide)

- **Public information only.** Every fact links to where it came from.
- **Nothing invented.** No made-up names, stats, partners or quotes; numbers are labelled as assumptions.
- **Businesses, not individuals.** No profiling of private shoppers.
- **Nothing sent automatically.** Everything is copy / open-in-mail; a human decides.
- **Booster's voice.** Calm, crafted, no logistics jargon.

## 8. How it's built

- **Backend API** (Node/TypeScript, reusable by any client: web, CLI, Slack bot, batch jobs)
  - `GET /v1/scout/stream`, `POST /v1/scout`: boutique pitch
  - `GET /v1/powerbuyers/stream`, `POST /v1/powerbuyers`: power buyers
  - `POST /v1/checks`: storefront checks only
  - `GET /v1/runs`: saved runs, replayable instantly
- **Two research modes:**
  - **Demo (no API key, free, ~8 s):** reads the boutique's own site, then writes from Booster-voice templates.
  - **Live (Anthropic API key):** Claude Opus 5.5 with web search + web fetch researches the wider web (press, LinkedIn, Companies House) and writes fully bespoke outreach as structured JSON.
- **Free, keyless data:** Shopify public endpoints, postcodes.io, OpenStreetMap (Overpass with Nominatim fallback, cached to disk so demos survive flaky Wi-Fi).
- **Web app:** no build step; live progress streaming; Leaflet map.

## 9. Limits and next steps (be honest on the last slide)

- Demo mode only sees the boutique's own website; live mode needs an API key (~1–2 min and pennies per run).
- Contacts are roles, not names, unless a public source names the person.
- OpenStreetMap coverage of clubs and offices varies; hotels are reliable.
- Next: track replies and auto-fill the [N] in the proof line; batch-scan every Shopify boutique in W1/SW1/WC/EC; a Shopify App Store listing as a distribution channel; a pledge page shoppers can opt into.

---

## Suggested deck outline (10–12 slides)

1. **Title:** "Booster Scout: find the boutique, make the case, open the door."
2. **The challenge:** the competition brief, quoted.
3. **Booster's problem:** a great promise, no proof yet; cold email at ~3.4%.
4. **Our answer:** research so specific it replaces social proof, plus demand from the neighbourhood.
5. **Demo, boutique pitch:** RIXO, from name to GO verdict in 8 seconds (scorecard screenshot).
6. **The outreach:** 3 people × email + LinkedIn note + Day 3/7/14, with sourced facts highlighted.
7. **After they say yes:** gaps → *illustrative* numbers → mechanism teaser (calculator screenshot).
8. **Power buyers:** map of 49 businesses around RIXO Marylebone; The Langham, the Churchill, the Mandeville.
9. **The flywheel:** concierges say yes → proof line → boutique says yes → more boutiques → more reasons for concierges to use it.
10. **Why it converts:** the benchmark table.
11. **Principles and build:** public data only, nothing invented, nothing auto-sent; reusable API, demo and live modes.
12. **Next steps / ask.**
