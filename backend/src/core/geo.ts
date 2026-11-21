// Free, keyless location data: postcodes.io (UK postcodes) + OpenStreetMap Overpass (places).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { get } from "./checks.js";

export interface LatLng { lat: number; lng: number }

export const POSTCODE_RE = /^\s*([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})?\s*$/i;

/** Postcode (full or outward, e.g. "W1U 4AD" or "W1U") → coordinates. */
export async function geocode(postcode: string): Promise<LatLng | null> {
  const pc = postcode.replace(/\s+/g, "").toUpperCase();
  const full = await get(`https://api.postcodes.io/postcodes/${pc}`, 8000);
  if (full) {
    const j = (await full.json().catch(() => null)) as
      | { result?: { latitude: number; longitude: number }; terminated?: { latitude: number; longitude: number } }
      | null;
    const r = j?.result ?? j?.terminated; // retired postcodes still have coordinates
    if (r?.latitude) return { lat: r.latitude, lng: r.longitude };
  }
  const outward = pc.length > 4 ? pc.slice(0, -3) : pc;
  const out = await get(`https://api.postcodes.io/outcodes/${outward}`, 8000);
  if (out) {
    const j = (await out.json().catch(() => null)) as { result?: { latitude: number; longitude: number } } | null;
    if (j?.result?.latitude) return { lat: j.result.latitude, lng: j.result.longitude };
  }
  return null;
}

export function metresBetween(a: LatLng, b: LatLng): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface OsmPlace { id: string; lat: number; lng: number; tags: Record<string, string> }

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const CACHE_DIR = process.env.CACHE_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "cache");
const cache = new Map<string, OsmPlace[]>();

/** Places around a point that tend to buy luxury on someone else's behalf. */
export async function placesAround(c: LatLng, radius: number, onRetry: (msg: string) => void = () => {}): Promise<OsmPlace[]> {
  const key = `${c.lat.toFixed(4)},${c.lng.toFixed(4)},${radius}`;
  if (cache.has(key)) return cache.get(key)!;
  const file = path.join(CACHE_DIR, `osm_${key.replace(/[^0-9.-]+/g, "_")}.json`);
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8")) as OsmPlace[];
    cache.set(key, saved);
    return saved;
  } catch { /* not cached yet */ }
  const a = `(around:${radius},${c.lat},${c.lng})`;
  const q = `[out:json][timeout:25];(
    nwr${a}["tourism"~"^(hotel|apartment|guest_house)$"]["name"];
    nwr${a}["club"]["name"];
    nwr${a}["amenity"~"^(events_venue|conference_centre|social_club)$"]["name"];
    nwr${a}["office"~"^(financial|company|lawyer|consulting|estate_agent|event_management|wedding_planner|private_office)$"]["name"];
  );out center tags 250;`;
  const save = async (places: OsmPlace[]) => {
    cache.set(key, places);
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(places));
    return places;
  };

  // 1) Overpass: full data (hotels, clubs, venues, offices). Public servers are often
  //    at capacity, so rotate mirrors with short timeouts.
  // Ask every mirror at once; first good answer wins.
  const ask = async (url: string) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "booster-scout/0.1" },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
    return j.elements
      .map((e) => ({ id: `${e.type}/${e.id}`, lat: e.lat ?? e.center?.lat ?? 0, lng: e.lon ?? e.center?.lon ?? 0, tags: e.tags ?? {} }))
      .filter((p) => p.lat && p.tags.name);
  };
  try {
    return await save(await Promise.any(OVERPASS.map(ask)));
  } catch {
    /* all busy */
  }

  // 2) Fallback: Nominatim search (separate infrastructure). Mostly hotels, which
  //    are the strongest power buyers anyway. Max 1 request/second by their policy.
  onRetry("Switching to OpenStreetMap search (Nominatim)");
  const dLat = radius / 111320, dLng = radius / (111320 * Math.cos((c.lat * Math.PI) / 180));
  const box = [c.lng - dLng, c.lat + dLat, c.lng + dLng, c.lat - dLat].map((n) => n.toFixed(5)).join(",");
  const out: OsmPlace[] = [];
  for (const term of ["hotel", "conference centre", "estate agent"]) {
    // Nominatim's usage policy asks for an identifying user agent
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(term)}&format=jsonv2&extratags=1&addressdetails=1&limit=50&bounded=1&viewbox=${box}`,
      { headers: { "user-agent": "booster-scout/0.1 (competition demo)" }, signal: AbortSignal.timeout(15000) },
    ).catch(() => null);
    if (r && r.ok) {
      const rows = (await r.json().catch(() => [])) as {
        osm_type: string; osm_id: number; lat: string; lon: string; name: string; category: string; type: string;
        extratags?: Record<string, string>; address?: Record<string, string>;
      }[];
      for (const e of rows) {
        if (!e.name || out.some((p) => p.id === `${e.osm_type}/${e.osm_id}`)) continue;
        const a = e.address ?? {};
        out.push({
          id: `${e.osm_type}/${e.osm_id}`, lat: parseFloat(e.lat), lng: parseFloat(e.lon),
          tags: {
            ...(e.extratags ?? {}), name: e.name, [e.category === "shop" ? "office" : e.category]: e.type,
            ...(a.road ? { "addr:street": a.road } : {}), ...(a.house_number ? { "addr:housenumber": a.house_number } : {}), ...(a.postcode ? { "addr:postcode": a.postcode } : {}),
          },
        });
      }
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (out.length) return save(out);
  throw new Error("Map data services (OpenStreetMap) are busy. Try again in a minute.");
}
