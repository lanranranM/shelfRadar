export interface PriceRow {
  retailer: string;
  title: string;
  url: string;
  price: number | null; // unconditional selling price; conditional coupons are separate
  listPrice: number | null; // explicitly stated original/reference price, not assumed coupon base
  currency: string;
  availability: string;
  promotion: string;
  snippet: string;
  history: number[]; // 24 hourly effective-price points, oldest → newest
  priceSource?: "merchant";
  comparable?: boolean;
  extractionStatus?: string;
  retrievalSource?: string;
  priceFreshness?: "fresh" | "cached" | "search" | "unknown";
}

export interface TraceStep {
  step: string;
  endpoint: string;
  detail: string;
}

export interface PriceCheckResult {
  rows: PriceRow[];
  mock: boolean;
  trace: TraceStep[];
  query: string;
  checkedAt?: string;
  prepared?: boolean;
}

/** Demo-safe fallback so the live demo never dies on stage. */
export function mockResult(product: string, competitors = ["amazon.com", "target.com", "bestbuy.com", "costco.com", "safeway.com"]): PriceCheckResult {
  // 24 hourly points; drops = [hourIndex, newPrice] — tells the story of
  // Amazon's coupon appearing ~4h ago and Costco's bundle promo ~8h ago.
  const H = (base: number, drops: [number, number][]): number[] => {
    const arr = new Array(24).fill(base);
    let cur = base;
    const sorted = [...drops].sort((a, b) => a[0] - b[0]);
    let di = 0;
    for (let i = 0; i < 24; i++) {
      while (di < sorted.length && sorted[di][0] === i) {
        cur = sorted[di][1];
        di++;
      }
      arr[i] = cur;
    }
    return arr;
  };
  const result: PriceCheckResult = {
    query: product,
    mock: true,
    trace: [
      {
        step: "1 — Discover",
        endpoint: "POST /search",
        detail: `type=auto, includeDomains=[${["walmart.com", ...competitors].join(", ")}], query="${product} buy price"`,
      },
      {
        step: "2 — Extract",
        endpoint: "POST /contents",
        detail:
          'summary schema={price, currency, availability, promotion}, maxAgeHours=24 (fresh crawl, not stale index)',
      },
      {
        step: "3 — (prod) Monitor",
        endpoint: "Monitors API",
        detail:
          "Illustrative trace only. The receiver can save structured observations from completed runs; no recurring schedule is active.",
      },
    ],
    rows: [
      {
        retailer: "Walmart",
        title: `${product} — Walmart.com`,
        url: "https://www.walmart.com/search?q=" + encodeURIComponent(product),
        price: 349.0,
        listPrice: 379.0,
        currency: "USD",
        availability: "In stock",
        promotion: "Rollback",
        snippet: "Free shipping, arrives in 2 days",
        history: H(349.0, []),
      },
      {
        retailer: "Amazon",
        title: `${product} — Amazon`,
        url: "https://www.amazon.com/s?k=" + encodeURIComponent(product),
        price: 329.99,
        listPrice: 349.99,
        currency: "USD",
        availability: "In stock",
        promotion: "$20 clip coupon at checkout",
        snippet: "Prime delivery tomorrow",
        history: H(349.99, [[20, 329.99]]),
      },
      {
        retailer: "Target",
        title: `${product} — Target`,
        url: "https://www.target.com/s?searchTerm=" + encodeURIComponent(product),
        price: 349.99,
        listPrice: 349.99,
        currency: "USD",
        availability: "In stock",
        promotion: "None",
        snippet: "Free 2-day shipping with RedCard",
        history: H(349.99, []),
      },
      {
        retailer: "Best Buy",
        title: `${product} — Best Buy`,
        url: "https://www.bestbuy.com/site/searchpage.jsp?st=" + encodeURIComponent(product),
        price: 379.99,
        listPrice: 379.99,
        currency: "USD",
        availability: "In stock",
        promotion: "None",
        snippet: "Open-box from $299",
        history: H(379.99, []),
      },
      {
        retailer: "Costco",
        title: `${product} (2-pack) — Costco`,
        url: "https://www.costco.com/CatalogSearch?keyword=" + encodeURIComponent(product),
        price: 599.99,
        listPrice: 649.99,
        currency: "USD",
        availability: "In stock",
        promotion: "$50 off bundle",
        snippet: "Includes extra battery — bundle only",
        history: H(649.99, [[16, 599.99]]),
      },
      {
        retailer: "Safeway",
        title: `${product} — Safeway (offer not verified)`,
        url: "https://www.safeway.com/shop/search-results.html?q=" + encodeURIComponent(product),
        price: null,
        listPrice: null,
        currency: "USD",
        availability: "Unknown",
        promotion: "Unknown",
        snippet: "No verified demo offer. Run a live check to discover Safeway product pages.",
        comparable: false,
        history: [],
      },
    ],
  };
  result.rows = result.rows.filter((row) => row.retailer === "Walmart" ||
    competitors.includes(new URL(row.url).hostname.replace(/^www\./, "")));
  return result;
}
