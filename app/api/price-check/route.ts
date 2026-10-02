import { NextRequest, NextResponse } from "next/server";
import Exa from "exa-js";
import { mockResult, PriceCheckResult, TraceStep } from "@/lib/mock";
import { DEMO_PRODUCTS, merchantOffer } from "@/lib/products";
import { PRICE_SCHEMA, RETAILERS, parseOffer, selectCandidateUrls, searchReference, preferPrice, retailerDomain } from "@/lib/extraction";
import { withExaBudget, budgetSummary } from "@/lib/exa-budget";
import { savePriceSamples } from "@/lib/price-history";

export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const product = typeof body.product === "string" ? body.product.trim() : "";
  const domains = [...new Set<string>((Array.isArray(body.competitors) ? body.competitors : Object.keys(RETAILERS))
    .filter((domain: unknown) => typeof domain === "string" && Object.hasOwn(RETAILERS, domain)))];
  if (!product) return NextResponse.json({ error: "product is required" }, { status: 400 });
  const walmartPrice = body.walmartPrice ?? DEMO_PRODUCTS.find((p) => p.name === product)?.walmartPrice;
  if (typeof walmartPrice !== "number" || !Number.isFinite(walmartPrice) || walmartPrice <= 0) {
    return NextResponse.json({ error: "A positive Walmart baseline price is required" }, { status: 400 });
  }
  const baseline = merchantOffer(product, walmartPrice);
  const baselineTrace: TraceStep = {
    step: "0 — Walmart baseline", endpoint: "Local merchant input · no Exa call",
    detail: `$${walmartPrice.toFixed(2)} USD; price and in-stock status are demo assumptions pending manager verification.`,
  };
  const withBaseline = (result: PriceCheckResult): PriceCheckResult => ({
    ...result,
    rows: [{ ...baseline, history: result.mock ? new Array(24).fill(walmartPrice) : [] },
      ...result.rows.filter((row) => row.retailer !== "Walmart")],
    trace: [baselineTrace, ...result.trace],
  });
  if (!domains.length) return NextResponse.json(withBaseline({ rows: [], mock: true, query: product,
    trace: [{ step: "Discover skipped", endpoint: "No Exa call", detail: "No competitors selected." }] }));
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return NextResponse.json(withBaseline(mockResult(product, domains)));

  const trace: TraceStep[] = [];
  try {
    const exa = new Exa(apiKey);
    const summary = {
      query: `Extract the MAIN offer for exactly: ${product}. Preserve exact model, flavor, bread type, condition and retail pack size. A requested 4-count box is valid; extra boxes or bundles are not. Use only explicit page evidence. Never infer price or stock from the title or Add to Cart. Separate conditional coupons, credit-card offers and financing from selling price. Ignore related/replacement product prices. Omit absent prices and use Unknown availability. Explain any ambiguity.`,
      schema: PRICE_SCHEMA,
    };
    const searchRes = await withExaBudget("Search: " + product, 0.05, () => exa.search(`${product} buy price`, {
      type: "auto", numResults: 12, includeDomains: domains, userLocation: "US",
      contents: { highlights: { query: `Exact ${product} retail pack selling price, stock and promotion conditions; distinguish unit price and other variants.` } },
    }));
    trace.push({ step: "1 — Discover", endpoint: "POST /search",
      detail: `type=auto, numResults=12, contents.highlights enabled (reference evidence; freshness unknown), includeDomains=[${domains.join(", ")}]; ${searchRes.results.length} candidates; requestId=${searchRes.requestId}; API cost estimate=$${searchRes.costDollars?.total ?? "unavailable"}` });
    const urls = selectCandidateUrls(searchRes.results, domains);
    if (!urls.length) throw new Error("No competitor product pages found");

    let rows = urls.map(url => parseOffer({ url, title: searchRes.results.find(result => result.url === url)?.title }));
    try {
      const contentsRes = await withExaBudget("Contents fresh: " + product, 0.05, () => exa.getContents(urls, {
        summary, text: { verbosity: "full", maxCharacters: 30000 }, maxAgeHours: 0, livecrawlTimeout: 20000,
      }));
      const statuses = contentsRes.statuses ?? [];
    trace.push({ step: "2 — Extract", endpoint: "POST /contents",
      detail: `summary.schema={productName,price,listPrice,currency,availability,promotion,comparable,evidence}; text=full, maxCharacters=30000 (price evidence validation); maxAgeHours=0; ${urls.length} requested pages; requestId=${contentsRes.requestId}; API cost estimate=$${contentsRes.costDollars?.total ?? "unavailable"}; statuses=${JSON.stringify(statuses)}` });
      rows = rows.map(row => {
        const content = contentsRes.results.find(content => content.url === row.url);
        const status = statuses.find(status => status.id === row.url);
        return content ? parseOffer(content, status?.source, product) : { ...row, extractionStatus: "crawl failed",
          snippet: `Fresh extraction failed: ${JSON.stringify(status?.error ?? "No content returned")}` };
      });
    } catch (error) {
      trace.push({ step: "2 — Fresh extraction failed", endpoint: "POST /contents",
        detail: (error as Error).message.replaceAll(apiKey, "[redacted]") });
    }
    const missing = rows.filter(row => row.price == null).map(row => row.url);
    if (missing.length) {
      try {
        const targetAlias = (url: string) => retailerDomain(url) === "target.com" && url.match(/\/A-(\d+)/)
          ? `https://www.target.com/p/-/A-${url.match(/\/A-(\d+)/)![1]}` : url;
        const cacheUrls = [...new Set(missing.flatMap(url => [url, targetAlias(url)]))];
        const cached = await withExaBudget("Contents cache fallback: " + product, 0.05, () => exa.getContents(cacheUrls, {
          summary, text: { maxCharacters: 30000 }, maxAgeHours: -1,
        }));
        rows = rows.map(row => {
          let offer = row;
          for (const url of [...new Set([row.url, targetAlias(row.url)])]) {
            const content = cached.results.find(content => content.url === url);
            if (!content) continue;
            const fallback = parseOffer(content, "cached", product);
            offer = preferPrice(offer, { ...fallback,
              snippet: `Cached reference — crawl time unknown; not a live quote. ${fallback.snippet}` });
          }
          return offer;
        });
        trace.push({ step: "2b — Missing-price cache fallback", endpoint: "POST /contents",
          detail: `maxAgeHours=-1; ${cacheUrls.length} URLs including Target canonical aliases; requestId=${cached.requestId}; cost=$${cached.costDollars?.total ?? "unknown"}; statuses=${JSON.stringify(cached.statuses ?? [])}` });
      } catch (error) {
        trace.push({ step: "2b — Cache fallback unavailable", endpoint: "POST /contents",
          detail: (error as Error).message.replaceAll(apiKey, "[redacted]") });
      }
    }
    rows = rows.map(row => {
      const candidate = searchRes.results.find(result => result.url === row.url);
      return candidate ? preferPrice(row, searchReference(candidate)) : row;
    });
    trace.push({ step: "2c — Coverage", endpoint: "Local validation · no Exa call",
      detail: domains.map(domain => `${RETAILERS[domain]}: ${rows.filter(row => retailerDomain(row.url) === domain && row.price != null).length} priced / ${rows.filter(row => retailerDomain(row.url) === domain).length} pages`).join("; ") + ". Cached/search prices are reference-only and excluded from live rules and trends." });
    for (const domain of domains) {
      if (!rows.some(row => retailerDomain(row.url) === domain)) {
        rows.push({ ...parseOffer({ url: `https://www.${domain}/`, title: "No matching product page found in this search" }),
          snippet: "This search did not return an eligible product URL for this retailer. No price or availability claim is made.",
          extractionStatus: "no product page" });
      }
    }
    trace.push({ step: "3 — Monitor", endpoint: "Monitors API · separate verification",
      detail: "Not invoked by a price check. See API verification for manual monitor lifecycle and webhook results; no recurring schedule is enabled." });
    const checkedAt = new Date().toISOString();
    await savePriceSamples(product, rows, "price-check", checkedAt);
    return NextResponse.json({ ...withBaseline({ rows, mock: false, trace, query: product }),
      checkedAt, budget: await budgetSummary() });
  } catch (error) {
    const message = (error as Error).message.replaceAll(apiKey, "[redacted]");
    // Real failures stay visible rather than silently presenting demo prices.
    return NextResponse.json({ error: message, trace: [baselineTrace, ...trace] }, { status: 502 });
  }
}
