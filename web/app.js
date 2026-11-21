const API = window.SCOUT_API.replace(/\/$/, "");
const KEY = window.SCOUT_KEY;
const api = (p) => fetch(API + p, { headers: KEY ? { "x-api-key": KEY } : {} }).then((r) => r.json());
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const link = (url, label = "source") => (url ? ` <a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>` : "");
const money = (n, cur) => (cur && cur !== "GBP" ? `${cur} ${Math.round(n)}` : `£${Math.round(n).toLocaleString("en-GB")}`);

let source;
let state = { report: null, checks: null };

function show(id, on = true) { $(id).classList.toggle("hidden", !on); }
function log(text) { $("now-text").textContent = text; const li = document.createElement("li"); li.textContent = text; $("log").appendChild(li); li.scrollIntoView({ block: "nearest" }); }
function setStage(stage) {
  let reached = false;
  for (const el of document.querySelectorAll(".stage")) {
    const s = el.dataset.stage;
    el.classList.remove("active", "done");
    if (s === stage) { el.classList.add("active"); reached = true; }
    else if (!reached) el.classList.add("done");
  }
}

function start(q) {
  if (source) source.close();
  state.done = false;
  $("go").disabled = true;
  $("log").innerHTML = ""; $("now").classList.remove("done"); $("progress").classList.remove("complete", "open");
  show("error", false); show("result", false); show("progress");
  log(`Scouting “${q}”`);
  source = new EventSource(`${API}/v1/scout/stream?q=${encodeURIComponent(q)}${KEY ? `&key=${encodeURIComponent(KEY)}` : ""}`);
  source.addEventListener("stage", (e) => { const d = JSON.parse(e.data); setStage(d.stage); log(d.text); });
  source.addEventListener("progress", (e) => log(JSON.parse(e.data).text));
  source.addEventListener("checks", (e) => {
    const c = JSON.parse(e.data).checks; state.checks = c;
    log(c.shopify ? `Shopify storefront confirmed (${c.shopifySignals.length} signals)` : "No Shopify storefront detected");
    if (c.prices) log(`${c.prices.productCount} products, median ${money(c.prices.median, c.prices.currency)}`);
  });
  source.addEventListener("dossier", (e) => { $("dossier").textContent = JSON.parse(e.data).markdown; });
  source.addEventListener("result", (e) => {
    const d = JSON.parse(e.data);
    document.querySelectorAll(".stage").forEach((el) => { el.classList.remove("active"); el.classList.add("done"); });
    state.done = true;
    log(`Done in ${d.seconds}s`); $("now").classList.add("done"); $("progress").classList.add("complete");
    state.checks = d.checks; render(d.report, d.checks); renderDemand(d.demand);
    finish(); loadRecent();
  });
  source.addEventListener("error", (e) => { if (!e.data) return; $("error").textContent = JSON.parse(e.data).message; show("error"); finish(); });
  source.onerror = (e) => { if (e.data) return; if (!state.done) { $("error").textContent = `Could not reach the Scout API at ${API}. Is the backend running?`; show("error"); } finish(); };
}
function finish() { state.done = true; $("go").disabled = false; if (source) source.close(); }

const LABELS = { shopify: "Shopify", london_zone: "In Booster zone", price_fit: "Price fit", delivery_gap: "Delivery gap", competitor: "Competitors" };
const STATUS = { pass: "Yes", warn: "Partly", fail: "No", unknown: "Unknown" };

function render(r, checks) {
  state.report = r;
  $("b-site").innerHTML = `<a href="${esc(r.boutique.website)}" target="_blank" rel="noopener" style="color:inherit">${esc(r.boutique.website)}</a>`;
  $("b-name").textContent = r.boutique.name;
  $("b-line").textContent = r.boutique.one_liner;
  $("b-stores").innerHTML = r.boutique.london_stores.map((s) =>
    `<li>${esc(s.address)} <b>${esc(s.postcode)}</b><span class="zone ${s.in_booster_zone ? "in" : "out"}">${s.in_booster_zone ? "in zone" : "outside zone"}</span></li>`).join("") || "<li>No London store found</li>";
  const v = r.viability;
  $("verdict").innerHTML = `<div class="eyebrow">Booster fit</div><div class="big ${v.verdict}">${v.verdict.replace("-", " ")}</div><div class="muted">${esc(v.headline)}</div>`;
  $("checks").innerHTML = Object.entries(LABELS).map(([k, label]) => {
    const c = v[k];
    return `<div class="check ${c.status}"><div class="label">${label}</div><div class="st">${STATUS[c.status]}</div>${esc(c.summary)}${link(c.source_url)}</div>`;
  }).join("");

  // Hard facts straight from the storefront
  if (checks && (checks.shopify || checks.prices)) {
    const p = checks.prices;
    const cell = (value, label) => `<div><b>${value}</b><span>${label}</span></div>`;
    $("hard-body").innerHTML =
      `<div class="stat-grid">${[
        cell(checks.shopify ? "Shopify" : "Not Shopify", `${checks.shopifySignals.length} platform signal${checks.shopifySignals.length === 1 ? "" : "s"} found`),
        cell(p ? money(p.median, p.currency) : "—", p ? `median price, ${p.productCount} products` : "no public catalogue"),
        cell(p ? `${Math.round((25 / p.median) * 100)}%` : "—", "£25 delivery vs. median item"),
        cell(p ? `${money(p.min, p.currency)}–${money(p.max, p.currency)}` : "—", "price range"),
      ].join("")}</div>` +
      (p ? `<div class="products">Sample products: ${p.sample.slice(0, 4).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title.replace(/\s+/g, " "))}</a> ${money(s.price, p.currency)}`).join(" · ")}</div>` : "");
    show("hard");
  } else show("hard", false);

  $("facts").innerHTML = r.facts.map((f, i) => `<li data-i="${i}">${esc(f.fact)}${link(f.source_url)}</li>`).join("");

  renderOrg(r);
  $("people").innerHTML = r.contacts.slice(0, 3).map((c, i) => {
    const m = r.messages.find((x) => x.contact_index === i);
    return `<button class="person" data-i="${i}">
      <span class="pnum">${i + 1}</span>
      <span class="pname">${esc(c.name || c.role)}</span>
      ${c.name ? `<span class="prole">${esc(c.role)}</span>` : ""}
      <span class="pangle">${esc(m ? m.angle : c.channel)}</span>
    </button>`;
  }).join("");
  $("people").querySelectorAll(".person").forEach((b) => (b.onclick = () => pickPerson(+b.dataset.i)));
  state.channel = state.channel || "online";
  pickPerson(0);

  $("timeline").innerHTML = r.follow_ups.map((f) => `
    <div class="step"><div class="day">Day ${f.day}</div><div class="ch">${esc(f.channel)}${f.subject ? ` · ${esc(f.subject)}` : ""}</div>
    <div class="body">${esc(f.body)}</div><button class="ghost" data-copy="${esc(f.body)}">Copy</button></div>`).join("");
  bindCopy($("timeline"));
  renderAfterYes(r);
  show("result");
  $("result").scrollIntoView({ behavior: "smooth" });
}

// ---- Decision-maker map ----
function renderOrg(r) {
  const nodes = r.org || [];
  show("org-card", nodes.length > 0);
  if (!nodes.length) return;
  const kids = (id) => nodes.filter((n) => n.reports_to === id);
  const box = (n) => {
    const rec = n.contact_index >= 0;
    const ch = kids(n.id);
    return `<div class="org-branch">
      <div class="org-node${rec ? " rec" : ""}" ${rec ? `data-i="${n.contact_index}"` : ""}>
        ${rec ? `<span class="pnum">${n.contact_index + 1}</span>` : ""}
        <div class="org-role">${esc(n.name || n.role)}</div>
        ${n.name ? `<div class="org-sub">${esc(n.role)}</div>` : ""}
        <div class="org-decides">${esc(n.decides)}</div>
      </div>
      ${ch.length ? `<div class="org-kids">${ch.map(box).join("")}</div>` : ""}
    </div>`;
  };
  $("org").innerHTML = kids("").map(box).join("");
  $("org").querySelectorAll(".org-node.rec").forEach((el) => (el.onclick = () => pickPerson(+el.dataset.i)));
  $("org-note").textContent = r.org.some((n) => n.name)
    ? "Names appear only where a public source shows them in that role. Numbered boxes are the three people to contact."
    : "Typical structure for a boutique brand of this size, by role. Confirm names on LinkedIn before reaching out. Numbered boxes are the three people to contact.";
}

// ---- Three people × two channels ----
document.querySelectorAll("#channels button").forEach((b) => (b.onclick = () => {
  state.channel = b.dataset.ch;
  pickPerson(state.person ?? 0);
}));

function pickPerson(i) {
  const r = state.report; const c = r.contacts[i]; if (!c) return;
  state.person = i;
  $("people").querySelectorAll(".person").forEach((b) => b.classList.toggle("on", +b.dataset.i === i));
  $("org").querySelectorAll(".org-node.rec").forEach((b) => b.classList.toggle("on", +b.dataset.i === i));
  document.querySelectorAll("#channels button").forEach((b) => b.classList.toggle("on", b.dataset.ch === state.channel));
  const m = r.messages.find((x) => x.contact_index === i);
  document.querySelectorAll("#facts li").forEach((li) => li.classList.toggle("used", Boolean(m && m.facts_used.includes(+li.dataset.i))));
  const who = `<p class="why-line"><b>Why ${esc(c.name || c.role)}:</b> ${esc(c.why)}</p>`;

  if (state.channel === "person") {
    const p = c.in_person;
    $("channel-panel").innerHTML = who + (p ? `
      <div class="ip-grid">
        <div><div class="eyebrow">Where to meet</div><ul class="ip-list">${p.where.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
        <div>
          <div class="eyebrow">Opening line</div><p class="opener">${esc(p.opener)}</p>
          <div class="eyebrow" style="margin-top:14px">Talking points</div><ul class="ip-list">${p.talking_points.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          <div class="actions"><button class="ghost" data-copy="${esc(`${p.opener}\n\n${p.talking_points.map((t) => `- ${t}`).join("\n")}`)}">Copy brief</button></div>
        </div>
      </div>
      <p class="muted small">Built from professional, public context only (the store, brand events, industry events, mutual connections). Scout does not look into anyone’s private life or personal social media.</p>`
      : `<p class="muted">Run Scout on this boutique again to get in-person suggestions.</p>`);
    bindCopy($("channel-panel"));
    return;
  }

  if (!m) { $("channel-panel").innerHTML = who; return; }
  const to = c.email_guess && !/unverified/i.test(c.email_guess) ? c.email_guess : "";
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
  $("channel-panel").innerHTML = who + `
    <div class="cta-row">
      <a href="${mailto}" class="cta"><button>✉ Email ${esc(c.name || c.role.split(",")[0])}</button></a>
      <button class="cta li-btn" id="li-go">in&nbsp; Connect on LinkedIn</button>
      <span class="muted small">${to ? `To ${esc(to)}` : c.email_guess ? esc(c.email_guess) : "No public address yet: the email opens without a recipient"}</span>
    </div>
    <div class="two">
      <div>
        <div class="mail">
          <div class="hdr">Subject: <b>${esc(m.subject)}</b></div>
          <div class="body">${esc(m.body)}</div>
        </div>
        <div class="actions"><button class="ghost" data-copy="${esc(`Subject: ${m.subject}\n\n${m.body}`)}">Copy email</button><span class="muted small" style="align-self:center">Uses ${m.facts_used.length} sourced facts</span></div>
      </div>
      <div>
        <div class="li"><div class="count">LinkedIn connection note · ${m.linkedin_note.length}/300</div>${esc(m.linkedin_note)}</div>
        <div class="actions"><button class="ghost" data-copy="${esc(m.linkedin_note)}">Copy note</button></div>
        <p class="muted small">“Connect on LinkedIn” copies this note and opens ${c.linkedin_url.includes("/search/") ? "a LinkedIn search for this role at the company" : "their profile"}. Paste the note into the connection request.</p>
      </div>
    </div>`;
  $("li-go").onclick = async () => {
    try { await navigator.clipboard.writeText(m.linkedin_note); } catch { /* clipboard blocked */ }
    if (c.linkedin_url) window.open(c.linkedin_url, "_blank", "noopener");
    $("li-go").textContent = "Note copied, opening LinkedIn…";
  };
  bindCopy($("channel-panel"));
}

// ---- After they say yes: gaps + illustrative numbers + mechanism teaser ----
const AY_INPUTS = { orders: "monthly_orders_in_zone", uptake: "uptake_pct", lift: "extra_conversion_pct", item: "avg_item", fee: "fee" };
function renderAfterYes(r) {
  const ay = r.after_yes;
  show("ay-card", Boolean(ay));
  if (!ay) return;
  for (const [id, key] of Object.entries(AY_INPUTS)) {
    $(`ay-${id}`).value = ay.scenario[key];
    $(`ay-${id}`).oninput = () => composeAfterYes(r);
  }
  composeAfterYes(r);
}
function composeAfterYes(r) {
  const ay = r.after_yes;
  const v = (id) => Math.max(0, parseFloat($(`ay-${id}`).value) || 0);
  const orders = v("orders"), uptake = v("uptake"), lift = v("lift"), item = v("item"), fee = v("fee");
  const hourOrders = Math.round((orders * uptake) / 100);
  const feeTotal = hourOrders * fee;
  const extraOrders = Math.round((orders * lift) / 100 * 10) / 10;
  const extraSales = Math.round(extraOrders * item);
  const gbp = (n) => `£${Math.round(n).toLocaleString("en-GB")}`;
  const body = [
    "Hello,",
    "",
    ay.opening,
    "",
    "Where we see room today",
    ...ay.gaps.map((g) => `• ${g}`),
    "",
    "What it could look like (illustrative)",
    `If around ${orders} of your online orders each month go to postcodes we cover, and ${uptake}% of those customers choose the hour:`,
    `• ${hourOrders} orders a month arrive within the hour, with ${gbp(feeTotal)} paid at your checkout for the privilege (at ${gbp(fee)}, a price you set).`,
    `• If having it tonight lifts conversion for those visitors by ${lift}%, that's roughly ${extraOrders} extra orders, or about ${gbp(extraSales)} a month in sales at a ${gbp(item)} average item.`,
    "These are our assumptions, not results. Booster is new, and we'd measure the real numbers with you during a pilot.",
    "",
    "How it works (a teaser)",
    ay.mechanism_teaser,
    "",
    ay.closing,
    "",
    "— The Booster team",
    "contact@booster.earth",
  ].join("\n");
  $("ay-subject").textContent = ay.subject;
  $("ay-body").textContent = body;
  $("ay-out").innerHTML = `<div><b>${hourOrders}</b><span>orders / month within the hour</span></div><div><b>${gbp(feeTotal)}</b><span>paid at checkout for the hour</span></div><div><b>${gbp(extraSales)}</b><span>extra sales / month from conversion</span></div>`;
  $("ay-copy").onclick = () => navigator.clipboard.writeText(`Subject: ${ay.subject}\n\n${body}`);
  $("ay-mailto").href = `mailto:?subject=${encodeURIComponent(ay.subject)}&body=${encodeURIComponent(body)}`;
}

function bindCopy(root) {
  root.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
    await navigator.clipboard.writeText(b.dataset.copy);
    const t = b.textContent; b.textContent = "Copied"; setTimeout(() => (b.textContent = t), 1200);
  }));
}

async function loadRecent() {
  try {
    let runs = await api("/v1/runs"); if (!Array.isArray(runs)) return;
    runs = runs.filter((r) => r.kind !== "powerbuyers");
    $("recent").innerHTML = runs.length ? "Recent: " + runs.map((r) => `<a data-id="${esc(r.id)}">${esc(r.name)}</a>`).join("") : "";
    $("recent").querySelectorAll("a").forEach((a) => (a.onclick = async () => {
      const d = await api(`/v1/runs/${encodeURIComponent(a.dataset.id)}`);
      show("progress", false); show("error", false);
      $("dossier").textContent = d.dossier || "";
      state.checks = d.checks; render(d.report, d.checks); renderDemand(d.demand);
    }));
  } catch { /* ignore */ }
}

async function loadMode() {
  try {
    const h = await api("/v1/health");
    const m = $("mode");
    const live = h.mode === "live";
    m.textContent = live ? "Live · Claude web research" : "Demo mode · no API key";
    m.title = live
      ? "Claude Opus 5.5 searches and reads the web"
      : "Reads the boutique's own public website and writes from Booster templates. Add an Anthropic API key for full Claude research.";
    m.className = "mode " + h.mode;
    $("research-label").textContent = live ? "Live research" : "Website research";
  } catch { /* backend down: shown when a search fails */ }
}
loadMode();

$("form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value.trim(); if (q) start(q); });
loadRecent();

// Collapse the research log once a run is done; this button re-opens it
document.querySelectorAll(".log-toggle").forEach((b) => (b.onclick = () => {
  const card = b.closest(".progress");
  card.classList.toggle("open");
  b.textContent = card.classList.contains("open") ? "Hide research log" : "Show research log";
}));
