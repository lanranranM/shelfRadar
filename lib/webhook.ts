import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyExaSignature(raw: string, signature: string, secret: string, now = Date.now()) {
  const parts = Object.fromEntries(signature.split(",").map((p) => p.trim().split("=")));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > 300 || !/^[a-f\d]{64}$/i.test(parts.v1 ?? "")) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest();
  const actual = Buffer.from(parts.v1, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
