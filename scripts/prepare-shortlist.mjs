import Exa from "exa-js";
import { mkdir, writeFile } from "node:fs/promises";
import { withExaBudget, budgetSummary } from "../lib/exa-budget.ts";
import { PRICE_SCHEMA, parseOffer, isProductUrl } from "../lib/extraction.ts";

// Bounded preparation, not a scheduler. Every request shares the cumulative $5 ledger.
const exa = new Exa(process.env.EXA_API_KEY);
const products = [
  { id: "ninja-af101", name: "Ninja AF101 4-quart air fryer", domains: ["amazon.com", "target.com", "bestbuy.com", "costco.com"] },
  { id: "cheerios-18oz", name: "Original Cheerios cereal 18 oz single box", domains: ["amazon.com", "target.com", "safeway.com", "costco.com"] },
];
await mkdir(".local/shortlist", { recursive: true });
for (const product of products) {
  const report = { product, checkedAt: new Date().toISOString(), searches: [], extractions: [] };
  const save = () => writeFile(`.local/shortlist/${product.id}-research.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  const summary = { schema: PRICE_SCHEMA, query: `Extract the main offer for exactly ${product.name}. Require exact model, flavor, net weight and pack count. Ignore related products and reviews. Report only explicit prices. Report original list price separately from selling price. Capture exact coupon, instant savings or membership promotion and all conditions; do not invent any coupon. Never infer in-stock from Add to Cart. Omit absent prices. Explain mismatched models or packs.` };
  for (const domain of product.domains) {
    try {
      const response = await withExaBudget(`Shortlist discovery ${product.id} ${domain}`, 0.08, () => exa.search(`${product.name} price sale coupon`, {
        type: "auto", numResults: 3, includeDomains: [domain], userLocation: "US",
        contents: { text: { maxCharacters: 45000 }, summary },
      }));
      report.searches.push({ domain, response });
      await save();
      console.log(JSON.stringify({ product: product.id, domain, results: response.results.map(r => ({ url: r.url, title: r.title, summary: r.summary, chars: r.text?.length })) }));
    } catch (error) { report.searches.push({ domain, error: error.message.replaceAll(process.env.EXA_API_KEY, "[redacted]") }); await save(); }
  }
  const urls = [...new Set(report.searches.flatMap(s => (s.response?.results ?? []).filter(r => isProductUrl(r.url)).slice(0, 2).map(r => r.url)))];
  if (urls.length) {
    try {
      const response = await withExaBudget(`Shortlist fresh ${product.id}`, 0.08, () => exa.getContents(urls, {
        maxAgeHours: 0, livecrawlTimeout: 20000, text: { verbosity: "full", maxCharacters: 45000 }, summary,
      }));
      report.extractions.push({ mode: "fresh", response });
      await save();
      console.log(JSON.stringify({ product: product.id, fresh: response.results.map(r => parseOffer(r, response.statuses?.find(s => s.id === r.url)?.source, product.name)) }));
    } catch (error) { report.extractions.push({ mode: "fresh", error: error.message.replaceAll(process.env.EXA_API_KEY, "[redacted]") }); await save(); }
  }
}
console.log(await budgetSummary());
