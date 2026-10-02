import type { PriceRow } from "./mock";

export function isLiveComparable(row: PriceRow) {
  return (!row.priceFreshness || row.priceFreshness === "fresh") && row.comparable !== false &&
    row.price != null && Number.isFinite(row.price) && row.price > 0 && row.currency === "USD" &&
    row.availability.toLowerCase() === "in stock" &&
    !/\b(?:bundle|\d+[- ]pack|refurbished|renewed|open[- ]box)\b/i.test(row.title);
}

/** Replay can compare verified cached offer records, never claim they are live. */
export function isSnapshotComparable(row: PriceRow) {
  return row.priceFreshness === "cached" && row.comparable === true
    ? isLiveComparable({ ...row, priceFreshness: "fresh" }) : isLiveComparable(row);
}

export function lowestVerifiedPrice(rows: PriceRow[], snapshot = false) {
  const valid = rows.filter(snapshot ? isSnapshotComparable : isLiveComparable);
  // A solitary Walmart baseline is not evidence of a price advantage.
  return new Set(valid.map(row => row.retailer)).size >= 2 ? Math.min(...valid.map(row => row.price!)) : null;
}

export function evaluateSpotlight(rows: PriceRow[], minRetailers: number, minSavings: number, snapshot = false) {
  const valid = rows.filter(snapshot ? isSnapshotComparable : isLiveComparable);
  // Multiple listings from one retailer count once, using its lowest offer.
  const byRetailer = new Map<string, PriceRow>();
  for (const row of valid) {
    const previous = byRetailer.get(row.retailer);
    if (!previous || row.price! < previous.price!) byRetailer.set(row.retailer, row);
  }
  const walmart = byRetailer.get("Walmart");
  const comparisons = walmart ? [...byRetailer.values()]
    .filter((row) => row.retailer !== "Walmart")
    .map((row) => ({
      row,
      saving: row.price! - walmart.price!,
      percent: (row.price! - walmart.price!) / row.price! * 100,
    })) : [];
  const validRule = Number.isInteger(minRetailers) && minRetailers >= 1 && minRetailers <= 5 &&
    Number.isFinite(minSavings) && minSavings > 0 && minSavings <= 100;
  const qualifying = validRule ? comparisons.filter((c) => c.saving > 0 && c.percent + 1e-9 >= minSavings) : [];
  return { walmart, comparisons, qualifying, validRule, eligible: validRule && qualifying.length >= minRetailers };
}
