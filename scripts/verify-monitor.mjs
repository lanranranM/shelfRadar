import Exa from "exa-js";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { withExaBudget, budgetSummary } from "../lib/exa-budget.ts";

const exa = new Exa(process.env.EXA_API_KEY);
const report = { checkedAt: new Date().toISOString(), status: "running", steps: [], scheduled: false };
await mkdir(".local", { recursive: true });
const save = () => writeFile(".local/monitor-verification.json", JSON.stringify(report, null, 2));
const step = async (name, detail = {}) => { report.steps.push({ name, ...detail }); console.log(JSON.stringify({ name, ...detail })); await save(); };
const http = async (url, options) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Webhook receiver HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
};
let receiver, monitor;
try {
  receiver = await http("https://webhook.site/token", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ default_status: 200, default_content: "ok", expiry: 3600, request_limit: 20 }) });
  await step("temporary_https_receiver_created");
  monitor = await exa.monitors.create({
    name: "ShelfRadar manual API verification",
    search: { query: "Sony WH-1000XM5 headphones current price promotions", includeDomains: ["amazon.com", "target.com", "bestbuy.com"], numResults: 5 },
    outputSchema: { type: "object", properties: { findings: { type: "array", items: { type: "object", properties: {
      product: { type: "string" }, price: { type: ["number", "null"] }, promotion: { type: "string" }, url: { type: "string" },
    }, required: ["product", "price", "promotion", "url"] } } }, required: ["findings"] },
    webhook: { url: `https://webhook.site/${receiver.uuid}`, events: ["monitor.run.completed"] },
    metadata: { purpose: "shelfradar-manual-api-verification" },
    // No trigger: manual-only, so no unattended paid runs.
  });
  await writeFile(".local/monitor-secret.json", JSON.stringify({ monitorId: monitor.id, webhookSecret: monitor.webhookSecret,
    product: "Sony WH-1000XM5 wireless noise cancelling headphones" }), { mode: 0o600 });
  report.monitorId = monitor.id;
  await step("POST /monitors", { id: monitor.id, manualOnly: monitor.trigger == null });
  const fetched = await exa.monitors.get(monitor.id);
  if (fetched.trigger !== null) throw new Error("Monitor unexpectedly has a recurring trigger");
  await step("GET /monitors/:id", { status: fetched.status });
  const trigger = await withExaBudget("Monitor: one manual run", 0.1, () => exa.monitors.trigger(monitor.id));
  if (!trigger.triggered) throw new Error("Monitor trigger was not accepted");
  await step("POST /monitors/:id/trigger", { triggered: true });
  let run;
  for (let attempt = 0; attempt < 36; attempt++) {
    const runs = await exa.monitors.runs.list(monitor.id, { limit: 1 });
    if (runs.data[0]) {
      run = await exa.monitors.runs.get(monitor.id, runs.data[0].id);
      if (["completed", "failed", "cancelled"].includes(run.status)) break;
    }
    await sleep(5000);
  }
  if (run?.status !== "completed") throw new Error(`Monitor run ${run?.status ?? "missing"}: ${run?.failReason ?? "timed out"}`);
  report.runId = run.id;
  report.output = run.output;
  await step("GET monitor run", { status: run.status, resultCount: run.output?.results?.length ?? 0, structuredOutput: typeof run.output?.content === "object" });
  let delivery;
  for (let attempt = 0; attempt < 18; attempt++) {
    const requests = await http(`https://webhook.site/token/${receiver.uuid}/requests?sorting=newest&per_page=10`);
    delivery = requests.data?.find((request) => {
      try { const e = JSON.parse(request.content); return e.type === "monitor.run.completed" && e.data?.id === run.id; } catch { return false; }
    });
    if (delivery) break;
    await sleep(5000);
  }
  if (!delivery) throw new Error("Run completed, but no webhook delivery observed within 90 seconds");
  const signature = Object.entries(delivery.headers).find(([key]) => key.toLowerCase() === "exa-signature")?.[1];
  const sig = Array.isArray(signature) ? signature[0] : signature;
  if (!sig) throw new Error("Webhook has no Exa-Signature header");
  const forward = () => fetch("http://localhost:3000/api/exa-webhook", { method: "POST", headers: { "Content-Type": "application/json", "Exa-Signature": sig }, body: delivery.content });
  const accepted = await forward();
  const receipt = await accepted.json();
  if (!accepted.ok || !receipt.accepted) throw new Error(`Local webhook verification failed: ${accepted.status}`);
  report.webhookVerified = true;
  await step("Exa webhook → temporary HTTPS receiver → local signature verification", receipt);
  const duplicate = await (await forward()).json();
  if (!duplicate.duplicate) throw new Error("Duplicate delivery was not deduplicated");
  const forged = await fetch("http://localhost:3000/api/exa-webhook", { method: "POST", headers: { "Exa-Signature": "invalid" }, body: delivery.content });
  if (forged.status !== 401) throw new Error("Forged webhook was not rejected");
  await step("webhook duplicate + invalid signature checks", { duplicateIgnored: true, invalidRejected: true });
  await exa.monitors.update(monitor.id, { status: "paused" });
  await step("PATCH /monitors/:id", { status: (await exa.monitors.get(monitor.id)).status });
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error.message).replaceAll(process.env.EXA_API_KEY, "[redacted]");
  console.log(JSON.stringify({ error: report.error }));
  process.exitCode = 1;
} finally {
  if (monitor) {
    try { await exa.monitors.delete(monitor.id); report.monitorDeleted = true; await step("DELETE test monitor", { deleted: true }); }
    catch { report.monitorDeleted = false; }
  }
  if (receiver) {
    try { const response = await fetch(`https://webhook.site/token/${receiver.uuid}`, { method: "DELETE" }); report.receiverDeleted = response.ok; }
    catch { report.receiverDeleted = false; }
  }
  report.budget = await budgetSummary();
  await save();
  console.log(JSON.stringify({ status: report.status, budget: report.budget, webhookVerified: report.webhookVerified, monitorDeleted: report.monitorDeleted }));
}
