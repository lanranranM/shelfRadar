import test from "node:test";
import assert from "node:assert/strict";
import { RETAILERS, retailerDomain, selectCandidateUrls, parseOffer, searchReference, preferPrice } from "./extraction.ts";

test("Safeway routes through the retailer allowlist and offer parser", () => {
  const url = "https://www.safeway.com/shop/product-details.example.html";
  assert.equal(RETAILERS["safeway.com"], "Safeway");
  assert.equal(retailerDomain(url), "safeway.com");
  assert.equal(retailerDomain("https://safeway.com.example.org/item"), undefined);
  assert.deepEqual(selectCandidateUrls([{ url }], ["safeway.com"]), [url]);
  assert.deepEqual(selectCandidateUrls([{ url }], ["target.com"]), []);
  const row = parseOffer({ url, summary: { price: 4.99, currency: "USD", comparable: true } });
  assert.equal(row.retailer, "Safeway");
  assert.equal(row.price, 4.99);
});

test("discovery excludes category/search pages", () => {
  assert.deepEqual(selectCandidateUrls([
    { url: "https://www.target.com/s/jimmy+dean" },
    { url: "https://www.target.com/p/sandwich/-/A-13383310" },
    { url: "https://www.amazon.com/s?k=sandwich" },
  ], ["target.com", "amazon.com"]), ["https://www.target.com/p/sandwich/-/A-13383310"]);
});

test("fallback fills only missing prices and keeps source fields together", () => {
  const fresh = parseOffer({ url: "https://www.target.com/p/example", summary: { comparable: true } }, "crawled");
  const cached = parseOffer({ url: fresh.url, summary: { price: 6.99, currency: "USD", availability: "In stock", comparable: true } }, "cached");
  assert.equal(preferPrice(fresh, cached).price, 6.99);
  assert.equal(preferPrice(fresh, cached).priceFreshness, "cached");
  assert.equal(preferPrice({ ...fresh, price: 7.99 }, cached).price, 7.99);
});

test("search reference accepts unambiguous product price but not unit prices or ranges", () => {
  const product = { url: "https://www.target.com/p/example", title: "Sandwich 4 count" };
  assert.equal(searchReference({ ...product, highlights: ["$6.99 ($0.39/ounce) Count 4"] }).price, 6.99);
  assert.equal(searchReference({ ...product, highlights: ["Price: 6.82 USD."] }).price, 6.82);
  for (const text of ["$6.99 - $11.99", "$6.99 Another product $5.00", "$0.39/ounce"]) {
    assert.equal(searchReference({ ...product, highlights: [text] }).price, null);
  }
  assert.equal(searchReference({ ...product, url: "https://www.target.com/s/milk", highlights: ["$6.99"] }).price, null);
  assert.equal(searchReference({ ...product, highlights: ["$6.99"] }).priceFreshness, "search");
});

test("source condition and delivery restriction override summary guesses", () => {
  const row = parseOffer({ url: "https://www.amazon.com/dp/example", title: "Sony headphones (Renewed)",
    summary: { price: 99, comparable: true, availability: "In stock" },
    text: "This item cannot be shipped to your selected delivery location." }, "crawled");
  assert.equal(row.comparable, false);
  assert.equal(row.availability, "Delivery restricted");
});

test("12-count cannot compare against requested 4-count even if summary says comparable", () => {
  const content = { url: "https://www.costco.com/example.product.123.html", title: "Jimmy Dean 12-count",
    summary: { price: 16.9, comparable: true } };
  assert.equal(parseOffer(content, "cached", "jimmy dean sandwiches 4 count").comparable, false);
  assert.equal(parseOffer({ ...content, title: "Jimmy Dean 4ct" }, "cached", "jimmy dean sandwiches 4 count").comparable, true);
});

test("summary prices must occur in returned text when text is available", () => {
  const content = { url: "https://www.target.com/p/example", summary: { price: 6.49 } };
  assert.equal(parseOffer({ ...content, text: "Price $6.99" }, "crawled").price, null);
  assert.equal(parseOffer({ ...content, text: "Price $6.49" }, "crawled").price, 6.49);
  assert.equal(parseOffer({ ...content, text: "Price: 6.49 USD." }, "cached").price, 6.49);
});

test("whole-dollar evidence cannot match a different cents price", () => {
  const content = { url: "https://www.target.com/p/example", summary: { price: 79 } };
  assert.equal(parseOffer({ ...content, text: "$79" }).price, 79);
  assert.equal(parseOffer({ ...content, text: "$79.00" }).price, 79);
  assert.equal(parseOffer({ ...content, text: "$79.99" }).price, null);
});

test("shortlist rejects wrong Ninja model and Cheerios weight or flavor", () => {
  const offer = { url: "https://www.target.com/p/example", summary: { comparable: true } };
  assert.equal(parseOffer({ ...offer, title: "Ninja AF141 5qt" }, "crawled", "Ninja AF101 4-quart air fryer").comparable, false);
  for (const title of ["Cheerios 20.35 oz 2-count", "Cheerios Honey Nut 18 oz", "Cheerios Protein 18 oz"]) {
    assert.equal(parseOffer({ ...offer, title }, "crawled", "Original Cheerios cereal 18 oz single box").comparable, false);
  }
});

test("promotion amounts absent from returned evidence are not displayed as verified", () => {
  const offer = { url: "https://www.target.com/p/example", text: "$79.99", summary: { promotion: "33% savings" } };
  assert.match(parseOffer(offer).promotion, /Unknown/);
  assert.equal(parseOffer({ ...offer, text: "Sale save $30.00 (25% off)", summary: { promotion: "Sale save $30.00 (25% off)" } }).promotion, "Sale save $30.00 (25% off)");
});
