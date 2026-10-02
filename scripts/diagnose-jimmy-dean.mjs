import Exa from "exa-js";
import { writeFile } from "node:fs/promises";
import { withExaBudget, budgetSummary } from "../lib/exa-budget.ts";
import { PRICE_SCHEMA } from "../lib/extraction.ts";
const exa = new Exa(process.env.EXA_API_KEY);
const urls = [
  "https://www.amazon.com/Jimmy-Dean-Sausage-Cheese-Croissant/dp/B00CJ8L5J6",
  "https://www.target.com/p/jimmy-dean-sausage-egg-cheese-frozen-croissant-sandwiches-4ct/-/A-13383310",
  "https://www.safeway.com/shop/pd/jimmy-dean-sausage-egg-and-cheese-english-muffin-sandwiches-4-ct/960023234",
];
const report = [];
for (const mode of ["fresh", "cached"]) {
  const response = await withExaBudget(`Jimmy Dean diagnostic ${mode}`, 0.04, () => exa.getContents(urls, {
    maxAgeHours: mode === "fresh" ? 0 : -1, livecrawlTimeout: 20000,
    text: { maxCharacters: 30000, ...(mode === "fresh" ? { verbosity: "full" } : {}) },
    ...(mode === "fresh" ? { summary: { schema: PRICE_SCHEMA,
      query: "Extract main Jimmy Dean breakfast sandwiches 4 count box offer, reporting exact flavor and bread type. A box containing four sandwiches is the requested retail package, not an excluded bundle. Only use explicitly visible current price, list price, stock and promotion conditions. Do not infer stock or prices; ignore related products." } } : {}),
  }));
  report.push({ mode, response });
  await writeFile(".local/jimmy-dean-diagnosis.json", JSON.stringify(report,null,2));
  console.log(JSON.stringify({ mode, statuses: response.statuses, results: response.results.map(r=>({ url:r.url,title:r.title,summary:r.summary,textLength:r.text?.length,text:r.text?.slice(0,6000) })) },null,2));
}
console.log(await budgetSummary());
