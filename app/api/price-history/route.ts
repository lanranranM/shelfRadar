import { NextRequest, NextResponse } from "next/server";
import { readPriceSamples } from "@/lib/price-history";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const product = req.nextUrl.searchParams.get("product")?.trim();
  if (!product) return NextResponse.json({ error: "Product required" }, { status: 400 });
  return NextResponse.json({ samples: await readPriceSamples(product) }, { headers: { "Cache-Control": "no-store" } });
}
