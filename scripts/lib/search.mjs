// ====================================================================
// File: scripts/lib/search.mjs
// Purpose: Provider-agnostic search adapter (SerpAPI or Bing).
// ====================================================================
import { existsSync, readFileSync } from "node:fs";

// --- simple .env loader (no extra deps) ---
function loadDotEnv() {
  if (!existsSync(".env")) return;
  const txt = readFileSync(".env", "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, k, vRaw] = m;
    const v = vRaw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadDotEnv();

export function getEnv(name, def = "") {
  return (process.env[name] ?? def).trim();
}

// --- SerpAPI (Google) ---
async function serpapiSearch(query, { count = 10, hl = "en", gl = "us" } = {}) {
  const key = getEnv("SERPAPI_KEY");
  if (!key) throw new Error("SERPAPI_KEY missing. Add it to .env.");
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(count));
  url.searchParams.set("hl", hl);
  url.searchParams.set("gl", gl);
  url.searchParams.set("api_key", key);

  const r = await fetch(url, { headers: { "User-Agent": "CAN/LinkDiscovery/1.0" } });
  if (!r.ok) throw new Error(`SerpAPI error ${r.status}`);
  const data = await r.json();
  const items = data?.organic_results ?? [];
  return items
    .filter(i => i?.link)
    .map(i => ({
      title: i.title || "",
      url: i.link || "",
      snippet: i.snippet || "",
      host: (() => { try { return new URL(i.link).host; } catch { return ""; } })()
    }));
}

// --- Bing (kept as a fallback if you add it later) ---
async function bingSearchRaw(query, { count = 10, mkt = "en-US", safe = "Moderate" } = {}) {
  const key = getEnv("BING_SEARCH_KEY");
  const endpoint = getEnv("BING_SEARCH_ENDPOINT", "https://api.bing.microsoft.com/v7.0/search");
  if (!key) throw new Error("BING_SEARCH_KEY missing. Add it to .env or use SERPAPI_KEY instead.");
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("mkt", mkt);
  url.searchParams.set("safeSearch", safe);
  url.searchParams.set("responseFilter", "Webpages");

  const r = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": key, "User-Agent": "CAN/LinkDiscovery/1.0" }
  });
  if (!r.ok) throw new Error(`Bing error ${r.status}`);
  const data = await r.json();
  const items = data?.webPages?.value ?? [];
  return items.map(v => ({
    title: v.name || "",
    url: v.url || "",
    snippet: v.snippet || "",
    host: (() => { try { return new URL(v.url).host; } catch { return ""; } })()
  }));
}

// --- Public API used by discovery scripts ---
export async function bingSearch(query, opts = {}) {
  // Despite the name, this function now routes to whatever provider is available.
  const provider = getEnv("SEARCH_PROVIDER").toLowerCase();
  const hasSerp = !!getEnv("SERPAPI_KEY");
  const hasBing = !!getEnv("BING_SEARCH_KEY");

  // Priority: explicit provider → else SerpAPI if key present → else Bing if key present → error
  if (provider === "serpapi") return serpapiSearch(query, opts);
  if (provider === "bing") return bingSearchRaw(query, opts);
  if (hasSerp) return serpapiSearch(query, opts);
  if (hasBing) return bingSearchRaw(query, opts);

  throw new Error("No search provider configured. Add SERPAPI_KEY (recommended) or BING_SEARCH_KEY in .env.");
}
