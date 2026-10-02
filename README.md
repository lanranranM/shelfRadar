# ShelfRadar

**An AI agent app for retail price intelligence, powered by agentic search with the Exa API.**

ShelfRadar helps retail category managers understand competitor offers and decide what to do next. A merchant supplies a product, a Walmart baseline price, competitor retailers, and an alert threshold. The app searches external product pages, extracts offer details, and turns the evidence into price alerts and deal suggestions.

The repository is named **shelfrader**. The app is an independent prototype, with Walmart as the example retailer; it is not an official Walmart or Sparky integration.

## What it does

- **Find competitor offers:** Search across selected retailers even when listing titles differ.
- **Read the offer:** Extract prices, availability, promotions, and supporting evidence; check product variants and pack sizes before comparison.
- **Flag pricing gaps:** Highlight comparable competitor offers below the merchant's price by a configurable threshold.
- **Suggest customer deals:** Preview a deal card when Walmart has a verified advantage, with a merchant review step.
- **Track observations:** Show a rolling 24-hour price chart and an API trace explaining where results came from.
- **Receive monitor updates:** Accept signed Exa Monitor webhook events and store eligible price observations.

## How Exa supports the agent workflow

```text
Product + retailers + merchant baseline
                   |
          Exa Search: discover pages
                   |
          Exa Contents: extract offers
                   |
        Validate identity, price and freshness
                   |
       Merchant alerts + reviewed deal cards
```

| Capability | Implementation |
| --- | --- |
| Discovery | Exa `POST /search` finds candidate product pages within selected retailer domains. |
| Extraction | Exa `POST /contents` returns page text and a structured summary for price, stock, promotions, and evidence. Fresh retrieval is requested with `maxAgeHours: 0`. |
| Monitoring | `POST /api/exa-webhook` verifies Exa signatures, checks the configured monitor ID, and deduplicates events. A recurring Exa Monitor must be configured separately. |

Search discovers candidates; matching and evidence checks determine whether they are safe to compare. Missing prices remain missing. Cached or search-only references are labeled separately from fresh observations.

## Local setup

Use Node.js **22.18 or newer** and npm.

```bash
git clone git@github.com:lanranranM/shelfrader.git
cd shelfrader
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Configure Exa

Create your own key in the [Exa dashboard](https://dashboard.exa.ai/api-keys), then set `EXA_API_KEY` in `.env.local`. Restart the development server after changing it.

```dotenv
EXA_API_KEY=
```

- Leave the value empty to use clearly labeled mock results without paid API calls.
- Set a valid key to enable live Exa searches and extraction.
- Keep the key server-side. Do not use a `NEXT_PUBLIC_` variable or put a key in source code.
- `.env.local` and other private environment files are excluded from Git. Only the blank `.env.example` is included.

### Try the workflow

1. Choose a product or enter a product description.
2. Confirm the merchant baseline price and choose competitor retailers.
3. Set an alert threshold, such as 5%, and run a price check.
4. Review the comparison table, source evidence, alerts, and deal suggestions.
5. Inspect the API trace and the 24-hour chart for retrieval details and saved observations.

Prepared snapshots are optional local recordings in `.local/shortlist/`; they are not included in a fresh clone. Use the regular price-check action for mock or live results.

## Deploy on a Node.js server

Deploy this version as **one Node.js process with persistent, writable storage**. Price history, the local API budget, optional snapshots, and monitor configuration are stored under `.local/` in the project directory.

On your server:

```bash
git clone git@github.com:lanranranM/shelfrader.git
cd shelfrader
npm ci
npm run build
mkdir -p .local
npm run start -- --hostname 127.0.0.1 --port 3000
```

Before starting, provide `EXA_API_KEY` through the server's secret/environment settings, or a private `.env.local` file. The build does not require a key. Run the start command under your process supervisor, with the project directory as its working directory, so the app restarts after a reboot.

For a hosted service, use these settings:

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npm run build` |
| Start command | `npm run start -- --hostname 0.0.0.0` |
| Runtime variable | `EXA_API_KEY` (secret); `PORT` if required by the host |
| Persistent disk | Mount at the project's `.local` directory; grant the app process read/write access. |
| Instances | One for this filesystem-backed prototype. |

Put the dashboard and price-check endpoint behind HTTPS and an authenticated reverse proxy or platform access control. The app does not include user authentication, and live price checks spend the server's Exa credits. If using Monitors, make only the signed webhook endpoint reachable by Exa.

**Serverless deployment:** Before deploying to an ephemeral or read-only filesystem, move `.local` state into a database or durable store. The current filesystem implementation is not a drop-in serverless deployment. Static hosting is also insufficient because the app uses server API routes.

See the [Next.js deployment guide](https://nextjs.org/docs/app/getting-started/deploying) for the underlying Node.js hosting model.

## Optional Exa Monitors

Recurring monitoring is **not enabled automatically** by starting the app. The chart polls saved history every 15 seconds; that does not perform a new retailer crawl.

To connect a monitor:

1. Create an Exa Monitor for your product query, with a schedule and a structured output schema compatible with the offer fields in `lib/extraction.ts`.
2. Set its webhook URL to `https://YOUR_DOMAIN/api/exa-webhook` for `monitor.run.completed` events.
3. Save its returned ID and signing secret in the private file `.local/monitor-secret.json`:

```json
{
  "monitorId": "YOUR_MONITOR_ID",
  "webhookSecret": "YOUR_WEBHOOK_SIGNING_SECRET",
  "product": "Exact product name, model and pack size"
}
```

4. Configure structured output as `findings`, an array of offers including `url`, `productName`, `price`, `currency`, `availability`, `promotion`, `comparable`, and `evidence`. Use the types in `PRICE_SCHEMA` in `lib/extraction.ts`. The receiver also reads results in the monitor output.
5. Trigger a run and confirm that the receiver accepts the signed event. Only eligible observations are added to history; an empty result does not invent a price.

The receiver currently supports one configured monitor. Supporting many products requires a monitor-to-product mapping and durable storage. Monitor discovery does not guarantee that every saved URL will be rechecked or that every price change will be returned.

`scripts/verify-monitor.mjs` is an optional, **paid integration check**. It creates a temporary receiver on webhook.site, manually triggers a monitor, verifies local webhook handling, and attempts cleanup. It is not the production scheduler and should not be run as part of deployment.

## API usage and limits

Live checks incur Exa usage charges. A check can include one search, content extraction for multiple pages, and a cached fallback if a fresh price cannot be extracted. Scheduled Monitors are additional usage.

The prototype maintains a local **$5 cumulative application budget guard** in `.local/exa-budget.json`, using conservative reservations and API-reported costs where available. It is not an account-wide spending cap, does not reset monthly, and does not cover independently scheduled Monitor runs. Keep the ledger persistent and use Exa account controls for account-wide usage management.

See [Exa pricing](https://exa.ai/docs/admin/pricing) for current billing details.

## Development

```bash
npm run typecheck
npm test
npm run build
```

The unit tests cover offer extraction, product comparison, price history, and deal-card eligibility. They do not require an Exa key. Scripts under `scripts/` support manual research and integration checks; some make paid external requests and are not part of `npm test`.

```text
app/                 Dashboard, chart, deal cards and API routes
lib/                 Extraction, matching, history, budget and webhook helpers
scripts/             Optional research and integration utilities
.env.example         Blank environment template
.local/              Private runtime state; excluded from Git
```

## Prototype boundaries

The Walmart price and stock status are merchant inputs/demo assumptions, not a live Walmart feed. Access-restricted or checkout-only offers may not be retrievable. Deal cards are previews and do not send customer notifications or update retailer prices. Mock curves, recorded snapshots, cached references, and live observations are identified in the interface.

Slide decks, speaker notes, research outputs, API credentials, and private runtime data are excluded from this repository.
