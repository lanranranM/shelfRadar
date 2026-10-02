"use client";

import { useState } from "react";
import type { PriceCheckResult } from "@/lib/mock";
import { evaluateSpotlight } from "@/lib/spotlight";

export default function DealSpotlight({ result }: { result: PriceCheckResult }) {
  const [minRetailers, setMinRetailers] = useState("1");
  const [minSavings, setMinSavings] = useState("5");
  const [selected, setSelected] = useState(false);
  const [published, setPublished] = useState(false);
  const deal = evaluateSpotlight(result.rows, Number(minRetailers), Number(minSavings), result.prepared);
  const names = deal.qualifying.map((c) => c.row.retailer).join(", ");
  const minimumSaving = Math.min(...deal.qualifying.map((c) => c.saving));
  // Floor the public percentage so rounding cannot exaggerate the savings.
  const minimumPercent = Math.floor(Math.min(...deal.qualifying.map((c) => c.percent)) * 10) / 10;
  const resetApproval = () => { setSelected(false); setPublished(false); };
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <section className="card spotlight" aria-labelledby="spotlight-heading">
      <div className="spotlight-heading">
        <div>
          <span className="eyebrow">From price advantage to customer discovery</span>
          <h2 id="spotlight-heading">3 · Deal Spotlight</h2>
        </div>
        <span className="badge mock">SIMULATED SPARKY PUBLISH</span>
      </div>
      <p className="spotlight-intro">Set your deal rule, review the offer, then choose what Sparky features for customers today.</p>
      <div className="spotlight-rule">
        <span>Generate a deal when Walmart is at least</span>
        <label className="spotlight-field">Savings (%)
          <input aria-label="Spotlight savings percent" type="number" min="0.1" max="100" step="0.1" value={minSavings}
            onChange={(e) => { setMinSavings(e.target.value); resetApproval(); }} />
        </label>
        <span>cheaper than at least</span>
        <label className="spotlight-field">Retailers (N)
          <input aria-label="Spotlight retailer count" type="number" min="1" max="5" step="1" value={minRetailers}
            onChange={(e) => { setMinRetailers(e.target.value); resetApproval(); }} />
        </label>
        <span>other retailers.</span>
      </div>
      {!deal.eligible ? (
        <div className="spotlight-empty" role="status">
          <strong>No qualifying deal yet</strong>
          <p>{!deal.validRule ? "Enter 1–5 retailers and savings greater than 0%, up to 100%." : !deal.walmart
            ? "An in-stock Walmart offer with a valid price is needed before a deal can be generated."
            : `${deal.qualifying.length} of ${minRetailers} required retailers meet your ${minSavings}% savings rule. Adjust the rule or run another price check.`}</p>
        </div>
      ) : (
        <div className="spotlight-grid">
          <div className="deal-candidate">
            <div className="spotlight-heading">
              <span className="eyebrow">Manager review</span>
              <span className={`badge ${published ? "best" : "warn"}`}>{published ? "FEATURED TODAY · DEMO" : "CANDIDATE DEAL"}</span>
            </div>
            <h3>{result.query}</h3>
            <div className="deal-price">${deal.walmart!.price!.toFixed(2)} <span>at Walmart</span></div>
            <p>Meets your rule against <strong>{deal.qualifying.length} retailer{deal.qualifying.length === 1 ? "" : "s"}</strong>.</p>
            <ul className="deal-evidence">
              {deal.qualifying.map(({ row, saving, percent }) => (
                <li key={row.retailer}>
                  <a href={row.url} target="_blank" rel="noreferrer">{row.retailer}</a>
                  <span>${row.price!.toFixed(2)} <b>Save ${saving.toFixed(2)} · {(Math.floor(percent * 10) / 10).toFixed(1)}%</b></span>
                </li>
              ))}
            </ul>
            <p className="spotlight-note">Comparison is limited to these retailers. Other offers may be cheaper. Review model, pack size and coupon conditions before selecting.</p>
            <label className="deal-select">
              <input type="checkbox" checked={selected} disabled={published} onChange={(e) => setSelected(e.target.checked)} />
              Select this deal — product and promotion reviewed
            </label>
            <button className="primary" disabled={!selected || published} onClick={() => setPublished(true)}>
              {published ? "Featured in today’s spotlight" : "Publish today’s spotlight"}
            </button>
            {published && <button className="secondary" onClick={resetApproval}>Remove from spotlight</button>}
          </div>
          <div className="sparky-preview">
            <div className="eyebrow">Customer view · {published ? "Today’s featured deal" : "Preview"}</div>
            <div className="sparky">
              <div className="who">✦ Sparky · Deal Spotlight · {today}</div>
              <h3>A little more value for your day.</h3>
              <p>Get <strong>{result.query}</strong> for <b>${deal.walmart!.price!.toFixed(2)}</b> at Walmart.</p>
              <p>Save at least <b>${minimumSaving.toFixed(2)} ({minimumPercent.toFixed(1)}%)</b> compared with the checked offers at {names}.</p>
              {deal.walmart!.promotion !== "None" && <p className="spotlight-note">Walmart offer: {deal.walmart!.promotion}</p>}
              <a className="deal-link" href={deal.walmart!.url} target="_blank" rel="noreferrer">View at Walmart →</a>
              <p className="spotlight-note">{result.mock ? "Illustrative demo prices. " : result.prepared ? "Recorded Exa snapshot, not live prices. " : "Prices from this check. "}Availability and offers may change; verify at checkout.</p>
              {deal.walmart!.priceSource === "merchant" && <p className="spotlight-note">Walmart price and availability are merchant-set demo assumptions, pending verification.</p>}
            </div>
            <p className="publish-status" role="status">{published
              ? "Published in this demo session. No customer notification was sent."
              : "Awaiting manager selection. Publishing will feature this card in the demo."}</p>
          </div>
        </div>
      )}
    </section>
  );
}
