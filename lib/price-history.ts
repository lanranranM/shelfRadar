import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PriceRow } from "./mock";

export interface PriceSample {
  at: string;
  retailer: string;
  price: number;
  url: string;
  source: "price-check" | "monitor";
}

const directory = (product: string) => path.join(process.cwd(), ".local", "price-history",
  createHash("sha256").update(product.trim().toLowerCase()).digest("hex"));

export async function savePriceSamples(product: string, rows: PriceRow[], source: PriceSample["source"], at = new Date().toISOString(), id = randomUUID()) {
  // Store observations, not changes. Equal consecutive prices are still samples.
  const samples: PriceSample[] = rows.filter((row) => row.priceSource !== "merchant" &&
    (!row.priceFreshness || row.priceFreshness === "fresh") &&
    row.comparable === true && row.currency === "USD" && row.price != null && Number.isFinite(row.price) && row.price > 0)
    .map((row) => ({ at, retailer: row.retailer, price: row.price!, url: row.url, source }));
  if (!samples.length) return 0;
  const dir = directory(product);
  await mkdir(dir, { recursive: true });
  const filename = createHash("sha256").update(id).digest("hex") + ".json";
  try { await writeFile(path.join(dir, filename), JSON.stringify(samples), { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  return samples.length;
}

export async function readPriceSamples(product: string, now = Date.now()): Promise<PriceSample[]> {
  const dir = directory(product);
  let files: string[];
  try { files = await readdir(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const groups = await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => {
    try { return JSON.parse(await readFile(path.join(dir, file), "utf8")) as PriceSample[]; }
    catch { return []; }
  }));
  return groups.flat().filter((sample) => Date.parse(sample.at) >= now - 86400000 && Date.parse(sample.at) <= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
