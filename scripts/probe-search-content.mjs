import Exa from "exa-js";
import { writeFile } from "node:fs/promises";
import { withExaBudget, budgetSummary } from "../lib/exa-budget.ts";
import { PRICE_SCHEMA } from "../lib/extraction.ts";
const exa = new Exa(process.env.EXA_API_KEY);
const report = [];
for (const [product, domains] of [
  ["Sony WH-1000XM5 new headphones", ["target.com/p", "bestbuy.com/product"]],
  ["JBL Flip 6 portable speaker new", ["jbl.com", "bhphotovideo.com", "kohls.com"]],
  ["Ninja AF101 air fryer new", ["kohls.com", "macys.com", "homedepot.com"]],
]) {
  const response = await withExaBudget(`Search with contents: ${product}`, 0.12, () => exa.search(`${product} current price sale discount`, {
    type: "auto", numResults: 6, includeDomains: domains, userLocation: "US",
    contents: { summary: { schema: PRICE_SCHEMA, query: `Extract the main offer for ${product}: unconditional price, original price, exact promotion and conditions. No bundles/refurbished/related models. Do not infer availability. Unknown when absent.` }, maxAgeHours: 0, livecrawlTimeout: 20000 },
  }));
  report.push({ product, response });
  await writeFile(".local/search-contents-research.json", JSON.stringify(report,null,2));
  console.log(JSON.stringify({ product, cost: response.costDollars, results: response.results.map(r=>({title:r.title,url:r.url,summary:r.summary})) },null,2));
}
console.log(await budgetSummary());
