import { readFile, writeFile } from "node:fs/promises";
import { parseOffer, isProductUrl, retailerDomain, RETAILERS } from "../lib/extraction.ts";
import { savePriceSamples } from "../lib/price-history.ts";

// Rebuild from recorded API evidence without issuing any network requests.
for (const id of ["ninja-af101", "cheerios-18oz"]) {
  const report = JSON.parse(await readFile(`.local/shortlist/${id}-research.json`, "utf8"));
  const candidates = [];
  const trace = [];
  for (const entry of report.searches) {
    if (!entry.response) continue;
    trace.push({ step: `Discover · ${entry.domain}`, endpoint: "POST /search",
      detail: `Recorded requestId=${entry.response.requestId}; query=${entry.query ?? report.product.name + " price sale coupon"}; includeDomains=[${entry.domain}]; cost=$${entry.response.costDollars?.total ?? "unknown"}` });
    for (const content of entry.response.results) {
      if (!isProductUrl(content.url)) continue;
      const row = parseOffer(content, "search", report.product.name);
      // Search content does not prove crawl time or live availability.
      candidates.push({ ...row, priceFreshness: "search", availability: "Unknown", retrievalSource: "Exa search content" });
    }
  }
  for (const entry of report.extractions) {
    if (!entry.response) continue;
    trace.push({ step: `Extract · ${entry.mode}`, endpoint: "POST /contents",
      detail: `Recorded requestId=${entry.response.requestId}; text+summary.schema; ${entry.mode === "fresh" ? "maxAgeHours=0" : "default freshness"}; cost=$${entry.response.costDollars?.total ?? "unknown"}; statuses=${JSON.stringify(entry.response.statuses)}` });
    for (const content of entry.response.results) {
      const source = entry.response.statuses?.find(s => s.id === content.url)?.source;
      candidates.push(parseOffer(content, source, report.product.name));
    }
  }
  // Explicit product-card evidence on Target's listing page; never the page's
  // generated summary, which can incorrectly attribute a neighboring SKU's price.
  if (id === "cheerios-18oz") {
    for (const entry of report.searches) {
      for (const content of entry.response?.results ?? []) {
        if (retailerDomain(content.url) !== "target.com" || isProductUrl(content.url)) continue;
        const card = content.text?.match(/\$(\d+\.\d{2})(?:\([^\n]*\))?\s*\n\s*General Mills Family Size Cheerios Cereal - 18oz\s*\n/i);
        if (!card) continue;
        candidates.push({ retailer: "Target", title: "General Mills Family Size Cheerios Cereal - 18oz", url: content.url,
          price: Number(card[1]), listPrice: null, currency: "USD", availability: "Unknown", comparable: true,
          promotion: "Unknown — no SKU-specific coupon verified", history: [], priceFreshness: "search", retrievalSource: "Exa search · exact product card",
          extractionStatus: "product-card evidence", snippet: `Exact product card returned by Exa: ${card[0].trim()}. Source age and stock unknown; general June promotion banner excluded. Not used for alerts or Spotlight.` });
      }
    }
  }
  const identityMatches = row => id === "ninja-af101"
    ? /\bAF\s*101\b/i.test(row.title) && !/\bAF\s*(?:141|181|101C)\b/i.test(row.title)
    : /cheerios/i.test(row.title) && !/\b(?:honey|multi[- ]?grain|oat crunch|protein|chocolate|cinnamon|berry|veggie|pumpkin|banana|lemon)\b/i.test(row.title);
  const score = row => (row.price != null ? 100 : 0) + (row.comparable ? 20 : 0) +
    (row.priceFreshness === "fresh" ? 10 : row.priceFreshness === "cached" ? 5 : 0);
  const rows = report.product.domains.map(domain => {
    const options = candidates.filter(r => retailerDomain(r.url) === domain && identityMatches(r)).sort((a,b) => score(b)-score(a));
    if (options.length) return options[0];
    return { retailer: RETAILERS[domain], title: "No verified matching offer retrieved", url: `https://www.${domain}/`,
      price: null, listPrice: null, currency: "Unknown", availability: "Unknown", promotion: "Unknown", history: [], comparable: false,
      priceFreshness: "unknown", extractionStatus: "not verified", retrievalSource: "Exa discovery",
      snippet: "The bounded Exa search did not retrieve a verifiable matching offer. This does not mean the retailer does not carry the product." };
  });
  const snapshot = { rows, mock: false, prepared: true, query: report.product.name, checkedAt: report.checkedAt,
    trace: [{ step: "0 — Replay", endpoint: "Local saved Exa evidence · no API call", detail: `Captured ${report.checkedAt}. Walmart is a merchant-set assumption. Unknown fields are not invented. No recurring monitors or new history points are created when loading this snapshot.` }, ...trace] };
  await writeFile(`.local/shortlist/${id}.json`, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  await savePriceSamples(report.product.name, rows, "price-check", report.checkedAt, `shortlist-${id}-${report.checkedAt}`);
  console.log(JSON.stringify({ id, rows: rows.map(({retailer,price,listPrice,promotion,comparable,priceFreshness,availability})=>({retailer,price,listPrice,promotion,comparable,priceFreshness,availability})) }, null, 2));
}
