import Exa from "exa-js";
import { mkdir, writeFile } from "node:fs/promises";
import { withExaBudget, budgetSummary } from "../lib/exa-budget.ts";
import { PRICE_SCHEMA } from "../lib/extraction.ts";

const exa = new Exa(process.env.EXA_API_KEY);
const urls = ["https://www.target.com/p/deans-whole-milk-1gal/-/A-84020507",
  "https://sameday.costco.com/store/costco/products/16902650-kirkland-signature-homogenized-milk-1-gal-4-qt"];
const report = [];
await mkdir(".local", { recursive: true });
for (const mode of ["original", "full", "summary-only"]) {
  const options = { maxAgeHours: 0, livecrawlTimeout: 20000,
    summary: { query: "Extract this page's main milk product offer: current selling price, original price, currency, availability and promotions. Do not confuse related products or site-wide banners with this item. Omit unavailable prices. comparable means one gallon whole milk.", schema: PRICE_SCHEMA },
    ...(mode === "original" ? { text: { maxCharacters: 3000 } } : mode === "full" ? { text: { verbosity: "full", maxCharacters: 30000 } } : {}),
  };
  const response = await withExaBudget("Diagnose contents " + mode, 0.05, () => exa.getContents(urls, options));
  report.push({ mode, options, response });
  await writeFile(".local/contents-diagnosis.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode, cost: response.costDollars, statuses: response.statuses,
    results: response.results.map(r => ({ url: r.url, summary: r.summary, textLength: r.text?.length,
      priceSnippets: r.text?.match(/.{0,80}\$\s*\d[\d.,]*.{0,100}/g)?.slice(0,12) })) }, null, 2));
}
console.log(await budgetSummary());
