import { mkdir, writeFile } from "node:fs/promises";
import { DEMO_PRODUCTS } from "../lib/products.ts";
import { budgetSummary } from "../lib/exa-budget.ts";

await mkdir(".local", { recursive: true });
const report = { checkedAt: new Date().toISOString(), products: [] };
for (const product of DEMO_PRODUCTS) {
  const response = await fetch("http://localhost:3000/api/price-check", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product: product.name, walmartPrice: product.walmartPrice,
      competitors: ["amazon.com", "target.com", "bestbuy.com", "costco.com"] }),
    signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  const rivals = (result.rows ?? []).filter((row) => row.retailer !== "Walmart");
  const check = {
    product: product.name, httpStatus: response.status, live: result.mock === false,
    structured: rivals.filter((row) => row.extractionStatus === "structured").length,
    prices: rivals.filter((row) => row.price != null).length,
    comparable: rivals.filter((row) => row.comparable && row.price != null).length,
    sources: rivals.map((row) => ({ retailer: row.retailer, price: row.price, availability: row.availability,
      comparable: row.comparable, source: row.retrievalSource })),
    passed: response.ok && result.mock === false && rivals.some((row) => row.extractionStatus === "structured"),
    result,
  };
  report.products.push(check);
  report.budget = await budgetSummary();
  await writeFile(".local/product-verification.json", JSON.stringify(report, null, 2));
  const { result: _, ...summary } = check;
  console.log(JSON.stringify(summary, null, 2));
}
report.status = report.products.every((p) => p.passed) ? "passed" : "failed";
await writeFile(".local/product-verification.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, budget: report.budget }));
if (report.status !== "passed") process.exitCode = 1;
