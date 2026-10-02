"use client";

import { useEffect, useState } from "react";
import type { PriceSample } from "@/lib/price-history";

const RETAILERS = [
  { name: "Amazon", domain: "amazon.com", color: "#ff9900", offset: 0.04 },
  { name: "Target", domain: "target.com", color: "#ff4d4d", offset: 0.08 },
  { name: "Best Buy", domain: "bestbuy.com", color: "#fbbf24", offset: 0.02 },
  { name: "Costco", domain: "costco.com", color: "#34d399", offset: -0.02 },
  { name: "Safeway", domain: "safeway.com", color: "#c084fc", offset: 0.06 },
];

export default function PriceTrend({ product, baseline, competitors, refreshKey }: {
  product: string; baseline: number; competitors: string[]; refreshKey: unknown;
}) {
  const [history, setHistory] = useState<{ product: string; samples: PriceSample[] }>({ product: "", samples: [] });
  const [now, setNow] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const refresh = async () => {
      if (active) setNow(Date.now());
      try {
        const response = await fetch(`/api/price-history?product=${encodeURIComponent(product)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("History unavailable");
        const data = await response.json();
        if (active) { setHistory({ product, samples: data.samples }); setUnavailable(false); }
      } catch { if (active) setUnavailable(true); }
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [product, refreshKey]);

  const base = Number.isFinite(baseline) && baseline > 0 ? baseline : 349;
  const visible = RETAILERS.filter((retailer) => competitors.includes(retailer.domain));
  const end = now ?? 0;
  const start = end - 86400000;
  const samples = (history.product === product ? history.samples : []).filter((sample) =>
    Date.parse(sample.at) >= start && Date.parse(sample.at) <= end && visible.some((r) => r.name === sample.retailer));
  const series = visible.map((retailer, index) => {
    const actual = samples.filter((sample) => sample.retailer === retailer.name);
    // Mock points are explicitly illustrative; never backfill real prices into past hours.
    const firstReal = actual.length ? Math.min(...actual.map((sample) => Date.parse(sample.at))) : Infinity;
    const mock = Array.from({ length: 25 }, (_, hour) => ({
      at: start + hour * 3600000,
      price: Math.round(base * (1 + retailer.offset + (hour < 17 - index * 2 ? 0.045 : 0) + (hour < 7 ? 0.025 : 0)) * 100) / 100,
    })).filter((point) => point.at < firstReal);
    return { ...retailer, mock, actual };
  });
  const prices = [base, ...series.flatMap((s) => [...s.mock, ...s.actual].map((p) => p.price))];
  const min = Math.min(...prices), max = Math.max(...prices);
  const padding = Math.max((max - min) * 0.2, base * 0.03, 1);
  const low = min - padding, high = max + padding;
  const x = (at: number) => 62 + ((at - start) / 86400000) * 560;
  const y = (price: number) => 20 + ((high - price) / (high - low)) * 215;
  const latest = samples.at(-1);

  return <section className="card" aria-label="24 hour price trend">
    <h2>24h price trend <span className={`badge ${samples.length ? "live" : "mock"}`}>
      {samples.length ? "DEMO + REAL SAMPLES" : "ILLUSTRATIVE DEMO"}
    </span></h2>
    <p className="spotlight-note">{product} · Dashed lines: simulated history.      Dots: observed prices.</p>
    <svg viewBox="0 0 690 275" role="img" aria-label="Trailing 24 hour prices: dashed demo history and timestamped real observations" style={{ width: "100%", height: "auto" }}>
      {[0, 0.5, 1].map((fraction) => {
        const value = low + (high - low) * fraction;
        return <g key={fraction}><line x1="62" x2="622" y1={y(value)} y2={y(value)} stroke="#243049" />
          <text x="54" y={y(value) + 4} textAnchor="end" fontSize="11" fill="#93a1b8">${value.toFixed(0)}</text></g>;
      })}
      {[0, 6, 12, 18, 24].map((hour) => <text key={hour} x={x(start + hour * 3600000)} y="263" textAnchor="middle" fontSize="11" fill="#93a1b8">{hour === 24 ? "now" : `-${24 - hour}h`}</text>)}
      <line x1="62" x2="622" y1={y(base)} y2={y(base)} stroke="#4f8cff" strokeDasharray="2 5" />
      {series.map((s) => <g key={s.name}>
        <polyline points={s.mock.map((p) => `${x(p.at)},${y(p.price)}`).join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray="6 5" opacity="0.7" />
        {s.actual.map((p) => <circle key={`${p.at}-${p.url}`} cx={x(Date.parse(p.at))} cy={y(p.price)} r="4.5" fill={s.color} stroke="#101827" strokeWidth="1.5">
          <title>{s.name}: ${p.price.toFixed(2)} · {new Date(p.at).toLocaleString()} · {p.source}</title>
        </circle>)}
      </g>)}
    </svg>
    <div className="legend"><span><span className="sw-dot" style={{ background: "#4f8cff" }} />Walmart baseline ${base.toFixed(2)}</span>
      {series.map((s) => <span key={s.name}><span className="sw-dot" style={{ background: s.color }} />{s.name}</span>)}
    </div>
    <p className="spotlight-note">{samples.length ? `${samples.length} real observations in the last 24h. Latest: ${latest ? new Date(latest.at).toLocaleTimeString() : "—"}.` : "No real observations yet — demo history stays visible."}
      {" "}Refreshes saved data every 15 seconds; no Exa calls. Demo data is not used for alerts or Deal Spotlight.
      {unavailable && " Update unavailable; keeping the chart and retrying automatically."}</p>
  </section>;
}
