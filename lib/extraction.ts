import type { PriceRow } from "./mock";

export const PRICE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    productName: { type: "string" },
    price: { type: "number", description: "Current unconditional one-time selling price. Omit if not visible. Never financing, credit-card sign-up, used, related-item or historical price." },
    listPrice: { type: "number", description: "Original price if explicitly stated; otherwise omit." },
    currency: { type: "string", description: "ISO currency code, e.g. USD. Unknown if unavailable." },
    availability: { type: "string", enum: ["In stock", "Out of stock", "Unknown"] },
    promotion: { type: "string", description: "Exact promotion and eligibility conditions; None if explicitly absent; Unknown if unavailable. Do not subtract conditional coupons from price." },
    comparable: { type: "boolean", description: "True only for the requested model or food variant, condition and requested retail pack size. A requested 4-count box is valid, not an excluded bundle. False for mismatched flavors, bread types, sizes, models, refurbished items, extra bundles or unclear identity." },
    evidence: { type: "string", description: "Brief source evidence for price, availability and model; explain uncertainty or blocked page." },
  },
  required: ["productName", "currency", "availability", "promotion", "comparable", "evidence"],
};

export const RETAILERS: Record<string, string> = {
  "amazon.com": "Amazon", "target.com": "Target", "bestbuy.com": "Best Buy", "costco.com": "Costco",
  "safeway.com": "Safeway",
};
export function retailerDomain(url: string) {
  try {
    const host = new URL(url).hostname;
    return Object.keys(RETAILERS).find((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch { return undefined; }
}

export function isProductUrl(url: string) {
  try {
    const path = new URL(url).pathname;
    switch (retailerDomain(url)) {
      case "amazon.com": return /\/(?:dp|gp\/product)\//.test(path);
      case "target.com": return path.startsWith("/p/");
      case "safeway.com": return /\/shop\/(?:pd\/|product-details\.)/.test(path);
      case "bestbuy.com": return path.startsWith("/product/") || /\/site\/[^/]+\/\d+\.p$/.test(path);
      case "costco.com": return /\/products\/|\.product\.|^\/p\//.test(path);
      default: return false;
    }
  } catch { return false; }
}

export function selectCandidateUrls(results: { url: string }[], domains: string[]) {
  const selected: string[] = [];
  for (let rank = 0; rank < 2; rank++) {
    for (const domain of domains) {
      const urls = [...new Set(results.filter((r) => retailerDomain(r.url) === domain && isProductUrl(r.url)).map((r) => r.url))];
      if (urls[rank]) selected.push(urls[rank]);
    }
  }
  return selected.slice(0, 8);
}

export function parseOffer(content: { url: string; title?: string | null; summary?: unknown; text?: string }, source?: string, product?: string): PriceRow {
  let data: Record<string, unknown> = {};
  let parsed = false;
  try {
    const value = typeof content.summary === "string" ? JSON.parse(content.summary) : content.summary;
    if (value && typeof value === "object" && !Array.isArray(value)) { data = value; parsed = true; }
  } catch { /* Malformed schema output remains unknown; never guess a price. */ }
  const price = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  const domain = retailerDomain(content.url);
  const title = content.title || (typeof data.productName === "string" ? data.productName : content.url);
  const wrongCondition = /\b(?:refurbished|renewed|open[- ]box|bundle|pack of [2-9]\d*)\b/i.test(title + " " + content.url);
  const count = (value: string) => value.match(/\b(\d+)\s*[- ]?\s*(?:count|ct|pack)\b/i)?.[1];
  const requestedCount = count(product ?? "");
  const offeredCount = count(title);
  const wrongCount = !!requestedCount && !!offeredCount && Number(requestedCount) !== Number(offeredCount);
  const requestedModel = product?.match(/\bAF\s*\d+[a-z]*\b/i)?.[0].replace(/\s/g, "").toLowerCase();
  const offeredModels = [...(title + " " + (typeof data.productName === "string" ? data.productName : "")).matchAll(/\bAF\s*\d+[a-z]*\b/gi)].map(m => m[0].replace(/\s/g, "").toLowerCase());
  const wrongModel = !!requestedModel && offeredModels.some(model => model !== requestedModel);
  const weight = (value: string) => value.match(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(?:oz|ounces?)\b/i)?.[1];
  const requestedWeight = weight(product ?? "");
  const offeredWeight = weight(title) ?? weight(String(data.productName ?? ""));
  const wrongWeight = !!requestedWeight && !!offeredWeight && Number(requestedWeight) !== Number(offeredWeight);
  const wrongFlavor = /original cheerios/i.test(product ?? "") && /\b(?:honey|multi[- ]?grain|oat crunch|protein|chocolate|cinnamon|berry)\b/i.test(title + " " + String(data.productName ?? ""));
  const restrictedDelivery = /cannot be shipped to your selected delivery location/i.test(content.text ?? "");
  const supportedPrice = (value: unknown) => {
    const amount = price(value);
    if (amount == null || content.text === undefined) return amount;
    const compact = content.text.replaceAll(",", "").replace(/\s+/g, "");
    const number = Number.isInteger(amount) ? `${amount}(?:\\.00)?` : amount.toFixed(2).replace(".", "\\.");
    return new RegExp(`(?:\\$${number}(?![\\d.])|(?<![\\d.])${number}USD\\b)`, "i").test(compact) ? amount : null;
  };
  const checkedPrice = supportedPrice(data.price);
  let promotion = typeof data.promotion === "string" && data.promotion.trim() && !/^[:/\s]*(?:null|n\/a)\s*$/i.test(data.promotion) ? data.promotion : "Unknown";
  if (content.text !== undefined && promotion !== "None") {
    const missingAmount = [...promotion.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)].some(m => supportedPrice(Number(m[1])) == null);
    const missingPercent = [...promotion.matchAll(/\b\d+(?:\.\d+)?%/g)].some(m => !content.text!.replace(/\s/g, "").includes(m[0]));
    if (missingAmount || missingPercent || !/coupon|sav(?:e|ing)|sale|discount|\boff\b|rollback|club|member|subscribe|gift|cashback|credit/i.test(promotion)) {
      promotion = "Unknown — no product-specific promotion verified";
    }
  }
  return {
    retailer: domain ? RETAILERS[domain] : new URL(content.url).hostname,
    title,
    url: content.url, price: checkedPrice, listPrice: supportedPrice(data.listPrice),
    currency: typeof data.currency === "string" ? data.currency : "Unknown",
    availability: restrictedDelivery ? "Delivery restricted" : ["In stock", "Out of stock"].includes(String(data.availability)) ? String(data.availability) : "Unknown",
    promotion,
    snippet: (typeof data.evidence === "string" ? data.evidence : "Structured extraction unavailable.") + (price(data.price) != null && checkedPrice == null ? " Summary price not found in returned source text; discarded." : "") + (restrictedDelivery ? " Source says this item cannot be shipped to the selected delivery location." : "") + (wrongCount ? ` Pack mismatch: requested ${requestedCount}, page says ${offeredCount}.` : ""),
    comparable: data.comparable === true && !wrongCondition && !wrongCount && !wrongModel && !wrongWeight && !wrongFlavor, extractionStatus: parsed ? "structured" : "unavailable",
    retrievalSource: source ?? "unknown", history: [],
    priceFreshness: source === "crawled" ? "fresh" : source === "cached" ? "cached" : "unknown",
  };
}

/** Search snippets are reference-only, never eligible for live rules or trend samples. */
export function searchReference(content: { url: string; title?: string | null; highlights?: string[] }): PriceRow {
  const text = (content.highlights ?? []).join("\n");
  const row = parseOffer(content, "search highlights");
  const amounts = [...text.matchAll(/\$\s*(\d[\d,]*\.\d{2})|\bPrice:\s*(\d[\d,]*\.\d{2})\s*USD\b/gi)]
    .filter(match => !/^\s*(?:\/|per\b)/i.test(text.slice(match.index! + match[0].length)))
    .map(match => Number((match[1] ?? match[2]).replaceAll(",", "")));
  const unique = [...new Set(amounts.filter(value => Number.isFinite(value) && value > 0))];
  // Avoid listing/range prices and ambiguous snippets containing several offers.
  const price = isProductUrl(content.url) && unique.length === 1 && !/\$\s*\d[\d,.]*\s*[-–]/.test(text) ? unique[0] : null;
  return { ...row, price, currency: price == null ? "Unknown" : "USD", priceFreshness: "search",
    snippet: `Search evidence only; crawl time unknown. ${text || "No pricing evidence returned."}` };
}

export function preferPrice(current: PriceRow, fallback: PriceRow): PriceRow {
  // Never replace an existing price or mix stock/promotions from different snapshots.
  return current.price == null && fallback.price != null ? fallback : current;
}
