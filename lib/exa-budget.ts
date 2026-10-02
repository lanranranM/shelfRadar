import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

type Entry = { id: string; label: string; reserved: number; accounted: number; status: string; at: string };
type Ledger = { limit: number; priorEstimate: number; entries: Entry[] };
const dir = path.join(process.cwd(), ".local");
const file = path.join(dir, "exa-budget.json");

async function editLedger<T>(edit: (ledger: Ledger) => T): Promise<T> {
  await mkdir(dir, { recursive: true });
  // Exclusive lock works across Next.js and the verification script.
  const lockPath = path.join(dir, "exa-budget.lock");
  const lock = await open(lockPath, "wx");
  try {
    let ledger: Ledger;
    try { ledger = JSON.parse(await readFile(file, "utf8")); }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      ledger = { limit: 5, priorEstimate: 0.075, entries: [] };
    }
    const result = edit(ledger);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(ledger, null, 2), { mode: 0o600 });
    await rename(temporary, file);
    return result;
  } finally { await lock.close(); await unlink(lockPath); }
}

export async function budgetSummary() {
  return editLedger((ledger) => ({
    limit: Math.min(5, ledger.limit), priorEstimate: ledger.priorEstimate,
    accounted: ledger.priorEstimate + ledger.entries.reduce((sum, entry) => sum + entry.accounted, 0),
    calls: ledger.entries.length,
  }));
}

/** Reserve before issuing a paid request; retain the reservation on uncertain failures. */
export async function withExaBudget<T>(label: string, reserve: number, call: () => Promise<T>): Promise<T> {
  const id = randomUUID();
  if (!Number.isFinite(reserve) || reserve <= 0) throw new Error("Invalid budget reservation");
  await editLedger((ledger) => {
    const used = ledger.priorEstimate + ledger.entries.reduce((sum, entry) => sum + entry.accounted, 0);
    if (used + reserve > Math.min(5, ledger.limit)) throw new Error("Exa task budget limit ($5) reached");
    ledger.entries.push({ id, label, reserved: reserve, accounted: reserve, status: "reserved", at: new Date().toISOString() });
  });
  const result = await call();
  const reported = (result as { costDollars?: { total?: number } }).costDollars?.total;
  await editLedger((ledger) => {
    const entry = ledger.entries.find((entry) => entry.id === id)!;
    entry.accounted = typeof reported === "number" && Number.isFinite(reported) && reported >= 0 ? reported : reserve;
    entry.status = typeof reported === "number" ? "api_estimate" : "conservative_reservation";
  });
  return result;
}
