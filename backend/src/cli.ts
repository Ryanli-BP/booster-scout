// Use the core without the HTTP server:  npm run scout -- "rixolondon.com"
import "./env.js";
import { scout } from "./core/scout.js";

const q = process.argv.slice(2).join(" ");
if (!q) {
  console.error('Usage: npm run scout -- "<boutique name or website>"');
  process.exit(1);
}
const result = await scout(q, (e) => {
  if (e.type === "stage" || e.type === "progress") console.error(`• ${e.text}`);
});
console.log(JSON.stringify(result.report, null, 2));
