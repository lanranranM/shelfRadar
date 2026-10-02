import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_PRODUCTS, merchantOffer } from "@/lib/products";
import type { PriceCheckResult } from "@/lib/mock";

// Read-only replay: no Exa calls, no new observations, no refreshed timestamps.
export async function GET(req: NextRequest) {
  const preset = DEMO_PRODUCTS.find(p => p.id === req.nextUrl.searchParams.get("id") && p.prepared);
  if (!preset) return NextResponse.json({ error: "Unknown prepared product" }, { status: 404 });
  const baseline = Number(req.nextUrl.searchParams.get("walmartPrice") ?? preset.walmartPrice);
  if (!Number.isFinite(baseline) || baseline <= 0) return NextResponse.json({ error: "Invalid Walmart baseline" }, { status: 400 });
  try {
    const result = JSON.parse(await readFile(path.join(process.cwd(), ".local", "shortlist", `${preset.id}.json`), "utf8")) as PriceCheckResult;
    return NextResponse.json({ ...result, prepared: true, rows: [merchantOffer(preset.name, baseline), ...result.rows.filter(r => r.retailer !== "Walmart")] });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return NextResponse.json({ error: "Snapshot has not been prepared yet" }, { status: 404 });
    return NextResponse.json({ error: "Unable to read prepared snapshot" }, { status: 500 });
  }
}
