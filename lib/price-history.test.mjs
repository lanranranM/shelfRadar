import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { savePriceSamples, readPriceSamples } from "./price-history.ts";

test("history keeps repeated observations, isolates products, excludes unknowns and expires old points", async () => {
  const cwd = process.cwd();
  const dir = await mkdtemp(path.join(tmpdir(), "shelfradar-history-test-"));
  process.chdir(dir);
  try {
    const now = Date.now();
    const row = { retailer: "Amazon", price: 100, currency: "USD", comparable: true, url: "https://amazon.com/example" };
    assert.deepEqual(await readPriceSamples("A"), []);
    await savePriceSamples("A", [row], "price-check", new Date(now - 1000).toISOString(), "first");
    await savePriceSamples("A", [row], "monitor", new Date(now).toISOString(), "second");
    await savePriceSamples("A", [row], "monitor", new Date(now).toISOString(), "second");
    await savePriceSamples("A", [row], "price-check", new Date(now - 90000000).toISOString(), "old");
    await savePriceSamples("A", [{ ...row, price: null }, { ...row, priceSource: "merchant" },
      { ...row, comparable: false }, { ...row, currency: "EUR" },
      { ...row, priceFreshness: "cached" }, { ...row, priceFreshness: "search" }], "price-check");
    assert.equal((await readPriceSamples("A", now)).length, 2);
    assert.deepEqual(await readPriceSamples("B", now), []);
    assert.equal((await readPriceSamples("A", now))[1].source, "monitor");
  } finally { process.chdir(cwd); await rm(dir, { recursive: true, force: true }); }
});
