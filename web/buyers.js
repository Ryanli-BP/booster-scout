// Power buyers view. Uses $, esc, link, api, show, API, KEY from app.js.
let pbSource, pbState = { result: null, map: null, layer: null, markers: {}, done: false };

// ---- view switching ----
document.querySelectorAll(".views button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".views button").forEach((x) => x.classList.toggle("on", x === b));
  for (const v of ["boutique", "requests", "buyers"]) show(`view-${v}`, b.dataset.view === v);
  if (b.dataset.view === "requests") rqLoad();
  if (b.dataset.view === "buyers") { pbLoadRecent(); setTimeout(() => pbState.map && pbState.map.invalidateSize(), 50); }
}));

function pbLog(text) {
  $("pb-now-text").textContent = text;
  const li = document.createElement("li"); li.textContent = text; $("pb-log").appendChild(li); li.scrollIntoView({ block: "nearest" });
}
function pbStage(stage) {
  let reached = false;
  for (const el of document.querySelectorAll("#pb-progress .stage")) {
    el.classList.remove("active", "done");
    if (el.dataset.stage === stage) { el.classList.add("active"); reached = true; } else if (!reached) el.classList.add("done");
  }
}
function pbFinish() { pbState.done = true; $("pb-go").disabled = false; if (pbSource) pbSource.close(); }

function pbStart(q) {
  if (pbSource) pbSource.close();
  pbState.done = false;
  $("pb-go").disabled = true; $("pb-log").innerHTML = ""; $("pb-now").classList.remove("done"); $("pb-progress").classList.remove("complete", "open");
  show("pb-error", false); show("pb-result", false); show("pb-progress");
  pbLog(`Looking for power buyers around “${q}”`);
  pbSource = new EventSource(`${API}/v1/powerbuyers/stream?q=${encodeURIComponent(q)}${KEY ? `&key=${encodeURIComponent(KEY)}` : ""}`);
  pbSource.addEventListener("stage", (e) => { const d = JSON.parse(e.data); pbStage(d.stage); pbLog(d.text); });
  pbSource.addEventListener("progress", (e) => pbLog(JSON.parse(e.data).text));
  pbSource.addEventListener("center", (e) => { const d = JSON.parse(e.data); pbLog(`Pinned ${d.label}`); });
  pbSource.addEventListener("result", (e) => {
    const d = JSON.parse(e.data);
    document.querySelectorAll("#pb-progress .stage").forEach((el) => { el.classList.remove("active"); el.classList.add("done"); });
    pbState.done = true; pbLog(`Done in ${d.seconds}s`); $("pb-now").classList.add("done"); $("pb-progress").classList.add("complete");
    pbRender(d); pbFinish(); pbLoadRecent();
  });
  pbSource.addEventListener("error", (e) => { if (!e.data) return; $("pb-error").textContent = JSON.parse(e.data).message; show("pb-error"); pbFinish(); });
  pbSource.onerror = (e) => { if (e.data) return; if (!pbState.done) { $("pb-error").textContent = `Could not reach the Scout API at ${API}. Is the backend running?`; show("pb-error"); } pbFinish(); };
}

const KIND_ICON = { hotel: "H", club: "C", venue: "V", office: "O" };

function pbRender(r) {
  pbState.result = r;
  const b = r.boutique;
  $("pb-where").textContent = b.store ? `${b.store.address} · ${b.store.postcode}` : b.area;
  $("pb-title").textContent = b.store ? `Power buyers around ${b.name}` : `Power buyers in ${b.area}`;
  $("pb-sub").textContent = `${r.summary.total} businesses within an 800 m walk. The ${r.buyers.length} best are ranked below, each with an email, a call script and one clear ask.`;
  const k = r.summary.byKind;
  $("pb-stats").innerHTML = [
    [k.hotel, "hotels"], [k.club, "clubs"], [k.venue, "venues"], [k.office, "offices"], [r.summary.within5, "within 5 min"],
  ].filter(([n]) => n).map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join("");

  $("pb-list").innerHTML = r.buyers.map((x, i) => `
    <li data-i="${i}">
      <span class="badge k-${x.kind}">${i + 1}</span>
      <div><div class="nm">${esc(x.name)}${x.stars ? ` <span class="stars">${"★".repeat(Math.round(parseFloat(String(x.stars).replace(",", "."))) || 0)}</span>` : ""}</div>
      <div class="muted small">${esc(x.detail)} · ${x.walkMins} min walk${x.email ? " · inbox found" : x.phone ? " · phone" : ""}</div></div>
    </li>`).join("");
  $("pb-list").querySelectorAll("li").forEach((li) => (li.onclick = () => pbPick(+li.dataset.i)));

  $("pb-proof").textContent = r.proofLine;
  $("pb-proof-copy").onclick = () => navigator.clipboard.writeText(r.proofLine);

  show("pb-result");
  pbMap(r);
  pbPick(0);
  $("pb-result").scrollIntoView({ behavior: "smooth" });
}

function pbMap(r) {
  if (!window.L) { $("pb-map").innerHTML = `<p class="muted">Map unavailable offline.</p>`; return; }
  if (!pbState.map) {
    pbState.map = L.map("pb-map", { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap contributors",
    }).addTo(pbState.map);
  }
  if (pbState.layer) pbState.layer.remove();
  pbState.layer = L.layerGroup().addTo(pbState.map);
  pbState.markers = {};
  const c = r.boutique.center;
  L.circle([c.lat, c.lng], { radius: 800, color: "#a5803f", weight: 1, fillOpacity: 0.04, dashArray: "4 4" }).addTo(pbState.layer);
  L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "pin-boutique", html: "B", iconSize: [30, 30] }) })
    .bindTooltip(r.boutique.store ? `${r.boutique.name}, ${r.boutique.store.address}` : r.boutique.area).addTo(pbState.layer);
  r.buyers.forEach((x, i) => {
    const m = L.marker([x.lat, x.lng], { icon: L.divIcon({ className: `pin k-${x.kind}`, html: String(i + 1), iconSize: [24, 24] }) })
      .bindTooltip(`${x.name} · ${x.walkMins} min`).on("click", () => pbPick(i)).addTo(pbState.layer);
    pbState.markers[i] = m;
  });
  pbState.map.setView([c.lat, c.lng], 15);
  setTimeout(() => pbState.map.invalidateSize(), 60);
}

function pbPick(i) {
  const r = pbState.result, x = r.buyers[i]; if (!x) return;
  $("pb-list").querySelectorAll("li").forEach((li) => li.classList.toggle("on", +li.dataset.i === i));
  Object.entries(pbState.markers).forEach(([j, m]) => m.getElement()?.classList.toggle("on", +j === i));
  const o = x.outreach;
  const mailto = `mailto:${encodeURIComponent(x.email || "")}?subject=${encodeURIComponent(o.subject)}&body=${encodeURIComponent(o.body)}`;
  $("pb-detail").innerHTML = `
    <div class="pb-head">
      <div>
        <div class="eyebrow">${esc(x.kindLabel)} · ${x.walkMins} min walk (${x.metres} m)</div>
        <h3 style="margin:2px 0 4px">${esc(x.name)}</h3>
        <div class="muted small">${esc(x.address || "")}</div>
      </div>
      <div class="pb-contact">
        <div><span class="muted small">Ask for</span><br><b>${esc(x.targetRole)}</b></div>
        ${x.email ? `<div><span class="muted small">Email</span><br><a href="mailto:${esc(x.email)}">${esc(x.email)}</a>${link(x.emailSource)}</div>` : ""}
        ${x.phone ? `<div><span class="muted small">Phone</span><br><a href="tel:${esc(x.phone.replace(/\s/g, ""))}">${esc(x.phone)}</a></div>` : ""}
        ${x.website ? `<div><span class="muted small">Website</span><br>${link(x.website, new URL(x.website).hostname.replace(/^www\./, ""))}</div>` : ""}
        <div>${link(x.osmUrl, "map listing")}</div>
      </div>
    </div>
    <p class="muted">${esc(x.why)}</p>
    <div class="two">
      <div>
        <div class="mail">
          <div class="hdr">To: <b>${esc(x.targetRole)}, ${esc(x.name)}</b>${x.email ? ` &lt;${esc(x.email)}&gt;` : ""}<br>Subject: <b>${esc(o.subject)}</b></div>
          <div class="body">${esc(o.body)}</div>
        </div>
        <div class="actions">
          <button class="ghost" data-copy="${esc(`Subject: ${o.subject}\n\n${o.body}`)}">Copy email</button>
          <a href="${mailto}"><button class="ghost">Open in mail app</button></a>
        </div>
      </div>
      <div>
        <div class="li script"><div class="count">Call script · front desk</div>${esc(o.phoneScript)}</div>
        <div class="actions"><button class="ghost" data-copy="${esc(o.phoneScript)}">Copy script</button></div>
        <div class="ask"><span class="muted small">The ask</span><br>${esc(o.ask)}</div>
      </div>
    </div>`;
  bindCopy($("pb-detail"));
  const m = pbState.markers[i]; if (m && pbState.map) pbState.map.panTo(m.getLatLng());
}

async function pbLoadRecent() {
  try {
    const runs = (await api("/v1/runs")).filter((r) => r.kind === "powerbuyers");
    $("pb-recent").innerHTML = runs.length ? "Recent: " + runs.map((r) => `<a data-id="${esc(r.id)}">${esc(r.name)}</a>`).join("") : "";
    $("pb-recent").querySelectorAll("a").forEach((a) => (a.onclick = async () => {
      const d = await api(`/v1/runs/${encodeURIComponent(a.dataset.id)}`);
      show("pb-progress", false); show("pb-error", false); pbRender(d);
    }));
  } catch { /* ignore */ }
}

$("pb-form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("pb-q").value.trim(); if (q) pbStart(q); });

// Deep links for demos: ?run=<saved run id>&at=<element id>
(async () => {
  const qs = new URLSearchParams(location.search);
  const id = qs.get("run");
  if (!id) return;
  const d = await api(`/v1/runs/${encodeURIComponent(id)}`);
  if (d.kind === "powerbuyers") {
    document.querySelector('[data-view="buyers"]').click();
    pbRender(d);
  } else {
    state.checks = d.checks; $("dossier").textContent = d.dossier || ""; render(d.report, d.checks); renderDemand(d.demand);
  }
  // ?shot=<id>: show only that card/section, for screenshots and slides
  const shotId = qs.get("shot");
  if (shotId) {
    const el = document.getElementById(shotId);
    const target = el && (el.matches(".card, section") ? el : el.closest(".card"));
    if (target) {
      document.querySelector("header").remove(); document.querySelector("footer").remove();
      const main = document.querySelector("main");
      main.replaceChildren(target);
      main.style.padding = "24px";
      target.classList.remove("hidden");
      window.scrollTo(0, 0);
      setTimeout(() => pbState.map && pbState.map.invalidateSize(), 50);
    }
    return;
  }
  const at = qs.get("at");
  setTimeout(() => {
    const el = at && document.getElementById(at);
    window.scrollTo({ top: el ? el.getBoundingClientRect().top + window.scrollY - 24 : 0, behavior: "instant" });
  }, 600);
})();
