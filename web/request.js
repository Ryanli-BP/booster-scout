// Public "Ask your boutique" page. Posts to the Scout API; counts only come back.
const API = window.SCOUT_API.replace(/\/$/, "");
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const ref = qs.get("ref") || "";
if (qs.get("b")) $("r-boutique").value = qs.get("b");

$("r-notify").onchange = () => {
  $("r-email-row").classList.toggle("hidden", !$("r-notify").checked);
  $("r-email").required = $("r-notify").checked;
};

$("req-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("r-error").classList.add("hidden");
  $("r-go").disabled = true;
  try {
    const res = await fetch(`${API}/v1/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        boutique: $("r-boutique").value,
        postcode: $("r-postcode").value,
        notify: $("r-notify").checked,
        email: $("r-email").value,
        ref,
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Something went wrong.");
    thanks(d);
  } catch (err) {
    $("r-error").textContent = err instanceof TypeError || !err.message ? "Couldn't reach Booster. Try again in a moment." : err.message;
    $("r-error").classList.remove("hidden");
  } finally {
    $("r-go").disabled = false;
  }
});

function thanks(d) {
  const b = d.boutique;
  $("ask").classList.add("hidden");
  $("thanks").classList.remove("hidden");
  $("t-title").textContent = d.count > 1 ? `You and ${d.count - 1} other${d.count > 2 ? "s" : ""} have asked ${b} for the hour.` : `You’re the first to ask ${b} for the hour.`;
  $("t-sub").textContent = d.inZone
    ? "Good news: your postcode is one we already cover. We’ll take your request to them."
    : "Your postcode is just outside the districts we cover today. We’re adding them one at a time, and your request helps decide which comes next.";

  const msg = `Hi ${b}, I love shopping with you and would order online more often if I could get it within the hour. Booster (booster.earth) offers that for London boutiques. Would you consider adding it?`;
  $("t-message").textContent = msg;
  $("t-copy-msg").onclick = () => copy($("t-copy-msg"), msg);

  const link = `${location.origin}${location.pathname}?ref=${d.code}&b=${encodeURIComponent(b)}`;
  $("t-link").value = link;
  $("t-copy-link").onclick = () => copy($("t-copy-link"), link);
  $("t-whatsapp").href = `https://wa.me/?text=${encodeURIComponent(`I just asked ${b} for within-the-hour delivery. Add your name too: ${link}`)}`;
  $("t-reward").textContent = window.REFERRAL_REWARD
    ? window.REFERRAL_REWARD.replace("{boutique}", b)
    : `Share your link. Every person who asks through it adds weight to your request for ${b}.`;
  pollReferrals(d.code);
}

async function pollReferrals(code) {
  try {
    const r = await (await fetch(`${API}/v1/requests/referrals/${encodeURIComponent(code)}`)).json();
    $("t-referred").textContent = r.referred ? `${r.referred} ${r.referred === 1 ? "person has" : "people have"} asked through your link.` : "";
  } catch { /* ignore */ }
}

async function copy(btn, text) {
  await navigator.clipboard.writeText(text);
  const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = t), 1200);
}
