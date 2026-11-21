// Customer requests view. Uses $, esc, api, show, start from app.js.
async function rqLoad() {
  try {
    const rows = await api("/v1/requests/summary");
    if (!Array.isArray(rows)) return;
    show("rq-empty", rows.length === 0);
    $("rq-body").innerHTML = rows.map((d) => {
      const top = Object.entries(d.districts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${esc(k)} (${n})`).join(", ");
      return `<tr>
        <td><b>${esc(d.boutique)}</b></td>
        <td class="n">${d.count}</td>
        <td class="n">${d.inZone}</td>
        <td>${top}</td>
        <td class="n">${d.referred}</td>
        <td><button class="ghost" data-q="${esc(d.boutique)}">Scout it</button></td>
      </tr>`;
    }).join("");
    $("rq-body").querySelectorAll("button[data-q]").forEach((b) => (b.onclick = () => {
      document.querySelector('[data-view="boutique"]').click();
      $("q").value = b.dataset.q;
      start(b.dataset.q);
    }));
  } catch { /* backend down */ }
}
$("rq-refresh").onclick = rqLoad;

// Request count on the boutique screen
function renderDemand(d) {
  const el = $("b-demand");
  if (!d || !d.count) { show("b-demand", false); return; }
  el.textContent = `${d.count} customer request${d.count > 1 ? "s" : ""} for this boutique · ${d.inZone} in Booster’s zone${d.referred ? ` · ${d.referred} via referrals` : ""}`;
  show("b-demand");
}
