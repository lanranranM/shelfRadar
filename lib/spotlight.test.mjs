import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSpotlight, lowestVerifiedPrice } from "./spotlight.ts";
import { mockResult } from "./mock.ts";

const offer = (retailer, price, extra = {}) => ({
  retailer, price, title: "Same product", currency: "USD", availability: "In stock", ...extra,
});

test("uses competitor price as denominator and includes exact threshold", () => {
  const deal = evaluateSpotlight([offer("Walmart", 90), offer("Amazon", 100)], 1, 10);
  assert.equal(deal.eligible, true);
  assert.equal(deal.qualifying[0].percent, 10);
  assert.equal(evaluateSpotlight([offer("Walmart", 90), offer("Amazon", 100)], 1, 10.01).eligible, false);
});

test("cached offers are usable only in explicitly requested snapshot simulation", () => {
  const rows = [offer("Walmart", 79), offer("Target", 89.99, { comparable: true, priceFreshness: "cached" })];
  assert.equal(evaluateSpotlight(rows, 1, 5).eligible, false);
  assert.equal(evaluateSpotlight(rows, 1, 5, true).eligible, true);
  assert.equal(lowestVerifiedPrice(rows), null);
  assert.equal(lowestVerifiedPrice(rows, true), 79);
  assert.equal(evaluateSpotlight([rows[0], { ...rows[1], priceFreshness: "search" }], 1, 5, true).eligible, false);
  assert.equal(evaluateSpotlight([rows[0], { ...rows[1], comparable: false }], 1, 5, true).eligible, false);
});

test("counts each retailer once and compares its cheapest eligible listing", () => {
  const rows = [offer("Walmart", 90), offer("Amazon", 120), offer("Amazon", 100)];
  assert.equal(evaluateSpotlight(rows, 2, 5).eligible, false);
  assert.equal(evaluateSpotlight(rows, 1, 15).eligible, false);
});

test("excludes missing prices, unavailable offers, foreign currency and bundles", () => {
  const rows = [offer("Walmart", 90), offer("Amazon", null), offer("Target", 100, { availability: "Out of stock" }),
    offer("Costco", 200, { title: "Product (2-pack)" }), offer("Other", 120, { currency: "CAD" }), offer("Best Buy", NaN)];
  assert.equal(evaluateSpotlight(rows, 1, 5).eligible, false);
  assert.equal(evaluateSpotlight([offer("Walmart", null), offer("Amazon", 100)], 1, 5).eligible, false);
});

test("ties and invalid rules never qualify", () => {
  const rows = [offer("Walmart", 100), offer("Amazon", 100)];
  for (const [n, x] of [[1, 5], [0, 5], [1.5, 5], [1, 0], [1, NaN], [1, 101]]) {
    assert.equal(evaluateSpotlight(rows, n, x).eligible, false);
  }
});

test("default demo qualifies against Best Buy, not Costco's bundle", () => {
  const deal = evaluateSpotlight(mockResult("Dyson V15").rows, 1, 5);
  assert.equal(deal.eligible, true);
  assert.deepEqual(deal.qualifying.map((c) => c.row.retailer), ["Best Buy"]);
  assert.equal(evaluateSpotlight(mockResult("Dyson V15").rows, 2, 5).eligible, false);
});

test("mock honors selected competitors, including an empty selection", () => {
  assert.deepEqual(mockResult("Dyson", ["amazon.com"]).rows.map((r) => r.retailer), ["Walmart", "Amazon"]);
  assert.equal(evaluateSpotlight(mockResult("Dyson", []).rows, 1, 5).eligible, false);
});

test("Safeway is selectable in mock mode without inventing an offer", () => {
  const rows = mockResult("Milk", ["safeway.com"]).rows;
  assert.deepEqual(rows.map(row => row.retailer), ["Walmart", "Safeway"]);
  assert.equal(rows[1].price, null);
  assert.equal(rows[1].comparable, false);
});

test("Spotlight supports five competing retailers", () => {
  const rows = [offer("Walmart", 90), ...["Amazon", "Target", "Costco", "Best Buy", "Safeway"].map(name => offer(name, 100))];
  assert.equal(evaluateSpotlight(rows, 5, 5).eligible, true);
  assert.equal(evaluateSpotlight(rows, 6, 5).validRule, false);
});

test("missing, cached and unavailable rivals cannot make Walmart lowest or trigger Spotlight", () => {
  const walmart = offer("Walmart", 90);
  assert.equal(lowestVerifiedPrice([walmart]), null);
  for (const rival of [offer("Target", null), offer("Target", 100, { priceFreshness: "cached" }),
    offer("Amazon", 100, { priceFreshness: "search" }), offer("Amazon", 100, { availability: "Delivery restricted" })]) {
    assert.equal(lowestVerifiedPrice([walmart, rival]), null);
    assert.equal(evaluateSpotlight([walmart, rival], 1, 5).eligible, false);
  }
  assert.equal(lowestVerifiedPrice([walmart, offer("Target", 100, { priceFreshness: "fresh" })]), 90);
});
