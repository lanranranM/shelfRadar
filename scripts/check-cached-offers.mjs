import Exa from "exa-js";
import { readFile, writeFile } from "node:fs/promises";
import { withExaBudget, budgetSummary } from "../lib/exa-budget.ts";
import { PRICE_SCHEMA, parseOffer } from "../lib/extraction.ts";
const exa = new Exa(process.env.EXA_API_KEY);
const input = JSON.parse(await readFile(".local/demo-product-research.json", "utf8"));
const report = [];
for (const entry of input) {
  const urls = entry.response.statuses.filter(s => /target\.com|bestbuy\.com/.test(s.id)).map(s => s.id).slice(0,6);
  const response = await withExaBudget(`Cached diagnostic ${entry.product}`, 0.05, () => exa.getContents(urls, {
    maxAgeHours: -1, text: { maxCharacters: 20000 },
    summary: { schema: PRICE_SCHEMA, query: `Extract exact main product ${entry.product}, new single unit, not refurbished or bundles. Only explicit price, original price and actual promotional discounts or gifts. Unknown availability unless page explicitly says In stock or Out of stock. Omit absent prices.` },
  }));
  report.push({ product: entry.product, response });
  await writeFile(".local/cached-offer-diagnosis.json", JSON.stringify(report,null,2));
  console.log(JSON.stringify({ product: entry.product, statuses: response.statuses, rows: response.results.map(r => parseOffer(r,"cached")) },null,2));
}
console.log(await budgetSummary());
