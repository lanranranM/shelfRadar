"use client";

import { useEffect, useState } from "react";
import type { PriceCheckResult, PriceRow } from "@/lib/mock";
import DealSpotlight from "./deal-spotlight";
import PriceTrend from "./price-trend";
import { DEMO_PRODUCTS } from "@/lib/products";
import { isLiveComparable, isSnapshotComparable, lowestVerifiedPrice } from "@/lib/spotlight";

const COMPETITORS = [
  { domain: "amazon.com", label: "Amazon" },
  { domain: "target.com", label: "Target" },
  { domain: "bestbuy.com", label: "Best Buy" },
  { domain: "costco.com", label: "Costco" },
  { domain: "safeway.com", label: "Safeway" },
];

const STEP_LABELS = [
  { title: "Discover", code: "POST /search", desc: "Find candidate product pages across selected retailers." },
  { title: "Extract", code: "POST /contents", desc: "Extract structured offer fields with a JSON schema and request fresh pages." },
  { title: "Monitor · receiver ready", code: "POST /api/exa-webhook", desc: "Append structured price observations to the trend. No recurring schedule enabled." },
];


export default function Home() {
  const [product, setProduct] = useState(DEMO_PRODUCTS[0].name);
  const [walmartPrice, setWalmartPrice] = useState(String(DEMO_PRODUCTS[0].walmartPrice));
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>(DEMO_PRODUCTS[0].competitors ?? COMPETITORS.map((c) => c.domain));
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<PriceCheckResult | null>(null);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("demo") === "1"
    ) {
      const t = setTimeout(() => run(), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (d: string) =>
    { setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d])); setResult(null); };

  async function loadPrepared() {
    const preset = DEMO_PRODUCTS.find(p => p.name === product && p.prepared);
    if (!preset) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/demo-snapshot?id=${preset.id}&walmartPrice=${encodeURIComponent(walmartPrice)}`);
      const data: PriceCheckResult & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Snapshot unavailable");
      setResult({ ...data, rows: data.rows.filter(r => r.retailer === "Walmart" || selected.some(d => COMPETITORS.find(c => c.domain === d)?.label === r.retailer)) });
      setStep(3);
    } catch (err) { setError(err instanceof Error ? err.message : "Snapshot unavailable"); }
    finally { setLoading(false); }
  }

  async function run() {
    setLoading(true);
    setError("");
    setResult(null);
    setStep(1);
    // Animate the pipeline steps for narration; the API call runs underneath.
    const timers = [1200, 2400].map((t, i) => setTimeout(() => setStep(i + 2), t));
    try {
      const response = await fetch("/api/price-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, walmartPrice: Number(walmartPrice), competitors: selected }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Price check failed");
      setStep(3);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Price check failed. Please try again.");
    } finally {
      timers.forEach(clearTimeout);
      setLoading(false);
    }
  }

  const eligibleOffer = result?.prepared ? isSnapshotComparable : isLiveComparable;
  const best = lowestVerifiedPrice(result?.rows ?? [], result?.prepared);
  const walmart = result?.rows.find((r) => r.retailer === "Walmart" && r.price != null);
  const pctBelow = (price: number | null) =>
    price != null && walmart?.price ? ((walmart.price - price) / walmart.price) * 100 : 0;
  const gapVsWalmart = (price: number | null) =>
    price != null && walmart?.price != null ? price - walmart.price : null;
  // Merchant alerts: competitor beats Walmart by >= threshold
  const alerts = (result?.rows ?? []).filter(
    (r) => r.retailer !== "Walmart" && eligibleOffer(r) && pctBelow(r.price) >= threshold
  );
  const hasPromo = (r: PriceRow) =>
    r.listPrice != null && r.price != null && r.listPrice > r.price;

  return (
    <div className="container">
      <div className="hero">
        <h1>
          Shelf<span>Radar</span>
        </h1>
        <p>
          ShelfRadar tells
          merchants what&apos;s on <b>everyone&apos;s</b> shelf — live
          cross-retailer price intelligence, powered by Exa&apos;s API.
        </p>
      </div>

      <div className="card">
        <h2>1 · Pick a product</h2>
        <label htmlFor="demo-product">Demo product shortlist</label>
        <select id="demo-product" disabled={loading} value={DEMO_PRODUCTS.find((p) => p.name === product)?.id ?? "custom"}
          onChange={(e) => {
            const preset = DEMO_PRODUCTS.find((p) => p.id === e.target.value);
            if (preset) { setProduct(preset.name); setWalmartPrice(String(preset.walmartPrice)); setSelected(preset.competitors ?? COMPETITORS.map(c => c.domain)); setResult(null); setError(""); }
          }}>
          {DEMO_PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          {!DEMO_PRODUCTS.some((p) => p.name === product) && <option value="custom">Custom product</option>}
        </select>
        <label>Product (as a merchant would type it)</label>
        <input
          type="text"
          disabled={loading}
          value={product}
          onChange={(e) => { setProduct(e.target.value); setResult(null); }}
          placeholder="e.g. Dyson V15 Detect cordless vacuum"
        />
        <label htmlFor="walmart-price">Walmart baseline price (USD) · merchant-set</label>
        <input id="walmart-price" type="number" min="0.01" step="0.01" value={walmartPrice} disabled={loading}
          onChange={(e) => { setWalmartPrice(e.target.value); setResult(null); }} />
        <p className="spotlight-note">Preset prices and in-stock status are demo assumptions. Verify or edit before presenting; Exa retrieves competitor offers only.</p>
        <label>Compare against</label>
        <div className="checks">
          {COMPETITORS.map((c) => (
            <label key={c.domain} className="check">
              <input
                type="checkbox"
                disabled={loading}
                checked={selected.includes(c.domain)}
                onChange={() => toggle(c.domain)}
              />
              {c.label}
            </label>
          ))}
        </div>
        <label>
          Merchant alert rule — flag any competitor priced more than{" "}
          <input
            type="number"
            min={1}
            max={50}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value) || 5)}
            style={{ display: "inline-block", margin: "0 6px" }}
          />
          % below Walmart
        </label>
        <button className="primary" onClick={run} disabled={loading || !product.trim() || !Number.isFinite(Number(walmartPrice)) || Number(walmartPrice) <= 0}>
          {loading ? "Checking shelves…" : "Run price check"}
        </button>
        {DEMO_PRODUCTS.some(p => p.name === product && p.prepared) && <button className="secondary" onClick={loadPrepared}
          disabled={loading || !Number.isFinite(Number(walmartPrice)) || Number(walmartPrice) <= 0}>Load prepared Exa demo </button>}
        {error && <p role="alert" className="gap-neg">{error}</p>}

        {(loading || result) && (
          <div className="steps">
            {STEP_LABELS.map((s, i) => (
              <div
                key={s.title}
                className={`step ${step > i + 1 || (result && step >= 3) ? "done" : step === i + 1 ? "active" : ""}`}
              >
                <b>
                  {i + 1} · {s.title}
                </b>
                <code>{s.code}</code>
                <div style={{ marginTop: 6 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="card">
            <h2>
              2 · Shelf snapshot{" "}
              {!result.mock && (
                <span className="badge live">{result.prepared ? "SAVED EXA DEMO · SNAPSHOT REPLAY" : "EXA RESULTS · CHECK SOURCE LABELS"}</span>
              )}
            </h2>
            {result.prepared && <p className="spotlight-note">Retrieved {result.checkedAt ? new Date(result.checkedAt).toLocaleString() : "previously"}. Replays recorded Exa evidence, not a new live check. Alerts and Spotlight below are a simulation against this snapshot and the merchant baseline. Missing prices and unverified coupons are not filled in.</p>}
            {!result.mock && (
              <p className="spotlight-note">
                {result.prepared ? "Snapshot comparisons can use captured in-stock offers, including cached pages of unknown age. Search-only prices remain reference-only. Walmart: merchant-set demo baseline." : "Fresh extraction first; Reference quotes have unknown age and are excluded from live alerts, Spotlight and real trend samples. Walmart: merchant-set demo baseline."}
                {!walmart && " Walmart’s price is unavailable, so Walmart comparisons, merchant alerts and Deal Spotlight cannot be evaluated."}
              </p>
            )}
            {!result.mock && result.rows.filter(row => row.retailer !== "Walmart" && row.price != null).length === 0 &&
              <p className="gap-neg">No competitor prices were retrieved. No lowest-price claim or savings comparison can be made.</p>}
            <table>
              <thead>
                <tr>
                  <th>Retailer</th>
                  <th>Selling price</th>
                  <th>Original price</th>
                  <th>vs Walmart</th>
                  <th>Availability</th>
                  <th>Promotion</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => {
                  const isBest = eligibleOffer(r) && best != null && r.price === best;
                  const isAlert = alerts.includes(r);
                  const gap = r.comparable === false ? null : gapVsWalmart(r.price);
                  return (
                    <tr
                      key={r.url}
                      className={isBest ? "best" : isAlert ? "alertrow" : ""}
                    >
                      <td>
                        <a href={r.url} target="_blank" rel="noreferrer">
                          {r.retailer}
                        </a>
                        {r.priceSource === "merchant" && <div><span className="badge warn">MERCHANT BASELINE</span></div>}
                        {r.priceFreshness === "search" && <div><span className="badge warn">SEARCH REFERENCE · AGE UNKNOWN</span></div>}
                        {r.priceFreshness === "fresh" && <div><span className="badge live">{result.prepared ? "OBSERVED AT CAPTURE" : "FRESH FETCH"}</span></div>}
                        {r.priceFreshness === "unknown" && <div><span className="badge warn">UNVERIFIED SOURCE</span></div>}
                        {r.comparable === false && <div><span className="badge warn">NOT COMPARABLE / UNVERIFIED</span></div>}
                        <div style={{ fontSize: 12, color: "#93a1b8", marginTop: 4 }}>
                          {r.title.slice(0, 60)}
                        </div>
                        {r.extractionStatus && <details className="spotlight-note"><summary>Source evidence · {r.retrievalSource}</summary>{r.snippet}</details>}
                      </td>
                      <td>
                        <span className="price">
                          {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                        </span>{" "}
                        {isBest && <span className="badge best">{result.prepared ? "LOWEST IN SNAPSHOT" : "LOWEST AMONG VERIFIED OFFERS"}</span>}
                        {isAlert && (
                          <span className="badge alert">
                            {pctBelow(r.price).toFixed(1)}% BELOW WM
                          </span>
                        )}
                        <div className="promo-note">
                          {r.priceSource === "merchant" ? "Demo price · pending verification" : r.price == null ? "Price unavailable — check source" : hasPromo(r)
                            ? `selling price · original $${r.listPrice!.toFixed(2)}`
                            : "Listed selling price · conditional offers shown separately"}
                        </div>
                      </td>
                      <td>{r.listPrice != null ? `$${r.listPrice.toFixed(2)}` : "—"}</td>
                      <td>
                        {r.retailer === "Walmart" || gap == null ? (
                          <span style={{ color: "#93a1b8" }}>—</span>
                        ) : gap < 0 ? (
                          <span className="gap-neg">
                            -${Math.abs(gap).toFixed(2)}
                            <div className="promo-note" style={{ color: "#f87171" }}>
                              {pctBelow(r.price).toFixed(1)}% below
                            </div>
                          </span>
                        ) : (
                          <span className="gap-pos">
                            +${gap.toFixed(2)}
                            <div className="promo-note">
                              {((gap / walmart!.price!) * 100).toFixed(1)}% above
                            </div>
                          </span>
                        )}
                      </td>
                      <td>{r.priceSource === "merchant" ? "In stock" : r.availability}</td>
                      <td style={{ fontSize: 13 }}>{r.promotion}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {alerts.length > 0 && (
              <div className="alertbox">
                🔴{" "}
                <b>
                  Merchant alerts — {alerts.length} product breach{alerts.length > 1 ? "es" : ""}{" "}
                  your {threshold}% rule:
                </b>
                <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                  {alerts.map((r) => (
                    <li key={r.url}>
                      <b>{r.retailer}</b> at ${r.price!.toFixed(2)}{" "}
                      {hasPromo(r)
                        ? `(selling price; original $${r.listPrice!.toFixed(2)}; ${r.promotion})`
                        : "(listed selling price; review promotion conditions)"}{" "}
                      — {pctBelow(r.price).toFixed(1)}% below Walmart&apos;s $
                      {walmart!.price!.toFixed(2)}.{" "}
                      {hasPromo(r)
                        ? "Review the offer conditions before repricing."
                        : "React before the customer traffic goes elsewhere."}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="trace">
              <details>
                <summary>API trace — what Exa did under the hood (narrate this)</summary>
                <pre>
                  {result.trace
                    .map((t) => `${t.step}\n  ${t.endpoint}\n  ${t.detail}`)
                    .join("\n\n")}
                </pre>
              </details>
            </div>
          </div>

          <DealSpotlight result={result} />

        </>
      )}

      <PriceTrend product={product.trim()} baseline={Number(walmartPrice)} competitors={selected} refreshKey={result} />

      <div className="footer">
        Pitched to <b>Walmart Category Management</b> · Powered by <b>Exa</b>{" "}
        {result && !result.mock && (
          <span className="badge live">EXA · SOURCE-LABELED</span>
        )}
      </div>
    </div>
  );
}
