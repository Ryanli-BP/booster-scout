// Where the Booster Scout API lives. Change this when you deploy the backend.
window.SCOUT_API = window.SCOUT_API || "http://localhost:8787";
// Only needed if the backend sets SCOUT_API_KEY.
window.SCOUT_KEY = window.SCOUT_KEY || "";
// Referral reward shown to shoppers after they ask. Booster decides this; leave empty for none.
// {boutique} is replaced with the boutique's name.
window.REFERRAL_REWARD = window.REFERRAL_REWARD ?? "Share your link. When {boutique} switches on within-the-hour delivery, your first delivery is on us, and so is your friend’s.";
