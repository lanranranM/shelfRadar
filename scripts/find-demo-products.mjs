import Exa from "exa-js";
import { mkdir, writeFile } from "node:fs/promises";
import { withExaBudget, budgetSummary } from "../lib/exa-budget.ts";
import { PRICE_SCHEMA, parseOffer } from "../lib/extraction.ts";

const exa = new Exa(process.env.EXA_API_KEY);
const products = process.argv.slice(2);
const report = [];
await mkdir(".local", { recursive: true });
for (const product of products) {
  const urls = [];
  for (const domain of (process.env.PROBE_DOMAINS?.split(",") ?? ["amazon.com", "bestbuy.com", "target.com"])) {
    const search = await withExaBudget(`Demo discovery ${product} ${domain}`, 0.05, () => exa.search(`${product} new buy price sale`, {
      type: "auto", includeDomains: [domain], numResults: 3, contents: false, userLocation: "US",
    }));
    urls.push(...search.results.map(r => r.url));
  }
  const response = await withExaBudget(`Demo offers ${product}`, 0.08, () => exa.getContents([...new Set(urls)], {
    maxAgeHours: 0, livecrawlTimeout: 20000, text: { verbosity: "full", maxCharacters: 18000 },
    summary: { schema: PRICE_SCHEMA, query: `Extract the MAIN PRODUCT offer for exactly ${product}, new condition, one unit. Exclude renewed/refurbished, bundles, and other models. Only report actual visible unconditional price, original price, and explicit stock status; otherwise omit prices and use Unknown availability. Never assume In stock. List exact sale, coupon, member discount or promotional gift, specifying conditions. Do not call financing, standard return policies, or generic delivery a promotion. Never use related-item prices.` },
  }));
  const entry = { product, checkedAt: new Date().toISOString(), rows: response.results.map(r => parseOffer(r, "crawled")), response };
  report.push(entry);
  await writeFile(process.env.PROBE_REPORT ?? ".local/demo-product-research.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ product, rows: entry.rows.map(({retailer,title,url,price,listPrice,promotion,availability,comparable}) => ({retailer,title,url,price,listPrice,promotion,availability,comparable})) }, null, 2));
}
console.log(await budgetSummary());
