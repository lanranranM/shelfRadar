import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyExaSignature } from "@/lib/webhook";
import { parseOffer, retailerDomain } from "@/lib/extraction";
import { savePriceSamples } from "@/lib/price-history";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const dir = path.join(process.cwd(), ".local");
  let config;
  try { config = JSON.parse(await readFile(path.join(dir, "monitor-secret.json"), "utf8")); }
  catch { return NextResponse.json({ error: "Monitor receiver not configured" }, { status: 503 }); }
  if (!verifyExaSignature(raw, req.headers.get("exa-signature") ?? "", config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  let event;
  try { event = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (event.type !== "monitor.run.completed" || event.data?.monitorId !== config.monitorId ||
      typeof event.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(event.id)) {
    return NextResponse.json({ error: "Unexpected monitor event" }, { status: 400 });
  }
  const events = path.join(dir, "monitor-events");
  await mkdir(events, { recursive: true });
  let samplesSaved = 0;
  // Only store explicit structured observations, never invent prices for empty runs.
  // Product identity comes from our trusted monitor configuration, not page text.
  if (typeof config.product === "string" && config.product.trim()) {
    const output = event.data.output;
    const findings = Array.isArray(output?.content?.findings) ? output.content.findings : [];
    const results = Array.isArray(output?.results) ? output.results : [];
    const rows = [...results, ...findings.map((finding: { url?: unknown }) => ({ url: finding.url, summary: finding }))]
      .filter((item) => typeof item.url === "string" && retailerDomain(item.url))
      .map((item) => parseOffer(item, "monitor"));
    const observedAt = typeof event.data.completedAt === "string" && Number.isFinite(Date.parse(event.data.completedAt))
      ? event.data.completedAt : new Date().toISOString();
    samplesSaved = await savePriceSamples(config.product, rows, "monitor", observedAt, event.id);
  }
  try {
    await writeFile(path.join(events, `${event.id}.json`), JSON.stringify(event, null, 2), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return NextResponse.json({ accepted: true, duplicate: true });
    throw error;
  }
  return NextResponse.json({ accepted: true, duplicate: false, status: event.data.status, samplesSaved });
}
