import type { PriceRow } from "./mock";

// Illustrative merchant-supplied prices. Verify these before presenting.
export const DEMO_PRODUCTS = [
  { id: "ninja-af101", name: "Ninja AF101 4-quart air fryer", walmartPrice: 79, prepared: true,
    competitors: ["amazon.com", "target.com", "bestbuy.com", "costco.com"] },
  { id: "cheerios-18oz", name: "Original Cheerios cereal 18 oz single box", walmartPrice: 12.98, prepared: true,
    competitors: ["amazon.com", "target.com", "safeway.com", "costco.com"] },
  { id: "dyson-v15", name: "Dyson V15 Detect cordless vacuum", walmartPrice: 349 },
  { id: "sony-xm5", name: "Sony WH-1000XM5 wireless noise cancelling headphones", walmartPrice: 299.99 },
];

export function merchantOffer(product: string, price: number): PriceRow {
  return {
    retailer: "Walmart",
    title: product,
    url: `https://www.walmart.com/search?q=${encodeURIComponent(product)}`,
    price,
    listPrice: price,
    currency: "USD",
    availability: "In stock",
    promotion: "None",
    snippet: "Merchant-set demo baseline. Price and availability need verification.",
    history: [],
    priceSource: "merchant",
  };
}
