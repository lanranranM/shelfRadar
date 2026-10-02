import Exa from "exa-js";
import { readFile, writeFile } from "node:fs/promises";
import { withExaBudget, budgetSummary } from "../lib/exa-budget.ts";
import { PRICE_SCHEMA } from "../lib/extraction.ts";
const exa = new Exa(process.env.EXA_API_KEY);
for (const id of ["ninja-af101", "cheerios-18oz"]) {
  const file = `.local/shortlist/${id}-research.json`;
  const report = JSON.parse(await readFile(file, "utf8"));
  const summary = { schema: PRICE_SCHEMA, query: `Only extract ${report.product.name}, not alternatives. Price must be explicitly attached to this exact product. Omit missing prices. Capture exact discount terms, excluding expired/site-wide banners, shipping, returns and financing. Explain pack/model mismatch. No invented coupon, price or stock.` };
  const queries = id === "ninja-af101" ? [
    ["target.com", '"AF101" price'], ["bestbuy.com", '"AF101" buy price'], ["costco.com", '"AF101"'],
  ] : [["target.com", '"Cheerios" "18oz" price'], ["safeway.com", '"Cheerios" "18" original cereal price']];
  for (const [domain, query] of queries) {
    const response = await withExaBudget(`Shortlist focused ${id} ${domain}`, 0.08, () => exa.search(query, {
      type: "auto", includeDomains: [domain], numResults: 5, userLocation: "US",
      contents: { text: { maxCharacters: 45000 }, summary },
    }));
    report.searches.push({ domain, query, response });
    await writeFile(file, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ id, domain, results: response.results.map(r=>({ url:r.url, summary:r.summary })) }));
  }
  const urls = id === "ninja-af101" ? [
    "https://www.target.com/p/-/A-53649826",
    "https://www.bestbuy.com/product/ninja-air-fryer-black-gray/JXJVXGK9G5",
    "https://www.bestbuy.com/site/ninja-air-fryer-black-gray/6269234.p",
  ] : ["https://www.target.com/p/-/A-81875238"];
  const response = await withExaBudget(`Shortlist canonical contents ${id}`, 0.05, () => exa.getContents(urls, {
    text: { maxCharacters: 45000 }, summary,
  }));
  report.extractions.push({ mode: "default", response });
  await writeFile(file, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ id, canonical: response.results.map(r=>({url:r.url,summary:r.summary})), statuses:response.statuses }));
}
console.log(await budgetSummary());
