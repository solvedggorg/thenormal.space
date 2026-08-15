# Public stats — design

Date: 2026-08-14

Status: draft for review

A public, cookieless stats page at `https://stats.thenormal.space` that shows how many people look at The Normal Space and the shop, which pages they open, which US states they come from, and how much junk the edge blocked.

## Goal

Someone opens `stats.thenormal.space` with no login and sees honest traffic for the last 24 hours, 7 days, or 30 days. The page is part of the same site family, not a third-party analytics product. It does not track people with cookies, city, or client JavaScript.

## Decisions

| Decision | Choice |
| --- | --- |
| Hosts counted | `thenormal.space` and `shop.thenormal.space` only |
| Hosts not counted | `api`, `auth`, `admin1`, `admin2`, `clerk`, `media`, `stats` |
| Identity | Pageviews we write (AE) + Cloudflare `sum.visits` for the two public hosts. No cookies, no visitor IDs. Not zone-wide unique IPs (rollups cannot filter by host) |
| Geography | US state (`request.cf.regionCode`) for page looks. No country list, no city, no map coordinates |
| Time ranges | `24h`, `7d`, `30d`. Default `7d`. URL `?range=` |
| Bots on the dashboard | Headline numbers are humans. Blocked bots are a count on the blocked strip |
| Bots at the edge | Super Bot Fight Mode: likely-automated → block, AI scrapers → block, verified search (Google/Bing) stays allow |
| Already live, unchanged | US-only WAF rule, VPN/Tor block, skip bot/WAF/geo on `auth.thenormal.space` |
| Approach | Tail Worker writes Analytics Engine; stats Worker queries AE SQL + GraphQL Analytics API; KV caches snapshots |

## Architecture

Three Workers, one WAF change.

```
thenormal.space          shop.thenormal.space
(thenormal-space)        (thenormalspace-shop)
        \                      /
         \   tail_consumers   /
          v                  v
         thenormal-stats-tail
                  |
                  | writeDataPoint (page views only)
                  v
         Analytics Engine: thenormal_pageviews
                  ^
                  | SQL API (token stays on the Worker)
                  |
         thenormal-stats  ---- GraphQL (visits, series, WAF blocks)
         stats.thenormal.space
                  |
                  v
               KV cache (24h / 7d / 30d snapshots)
```

### Producers

Existing Workers `thenormal-space` and `thenormalspace-shop` add:

```jsonc
"tail_consumers": [{ "service": "thenormal-stats-tail" }]
```

and `assets.run_worker_first` so document requests run the Worker (and therefore the Tail Worker) even when the HTML is a static asset.

No request-path instrumentation in marketing or shop application code.

### Tail Worker (`thenormal-stats-tail`)

Lives at `stats/tail`. Exports only `tail()`. After each producer invocation it decides whether the event is a page look. If yes, it calls `env.PAGEVIEWS.writeDataPoint(...)` (fire-and-forget, no await). Deploy this Worker before the producers.

### Stats Worker (`thenormal-stats`)

Lives at `stats/app`. Custom domain `stats.thenormal.space`. Serves the public HTML/CSS/JS as assets and `GET /api/snapshot`. A cron about every 60 seconds builds one snapshot per range from AE SQL + GraphQL and writes KV. The Cloudflare API token is a Worker secret and never appears in HTML or JSON.

This Worker is not a tail producer. Opening the dashboard does not increment stats.

### WAF (same change set, not a Worker)

On zone `thenormal.space` (id `311f1a68293f44452ef3147ec6f4ea8b`):

- Super Bot Fight Mode: `sbfm_likely_automated` → `block`
- AI scrapers: `ai_bots_protection` → `block` (not `only_on_ad_pages`)
- Leave `sbfm_definitely_automated` = `block`, `sbfm_verified_bots` = `allow`
- Do not change the US-only rule, the VPN/Tor rule, or the auth skip

## Data

Two sources, one public snapshot. Nothing personally identifying is stored or shown.

### Analytics Engine dataset `thenormal_pageviews`

One point per HTML page look that passed the tail filter.

| Field | Meaning |
| --- | --- |
| `index1` | Host: `thenormal.space` or `shop.thenormal.space` |
| `blob1` | Path, query stripped, hash stripped, max 256 chars. Redacted or empty → `/` |
| `blob2` | Referrer **host** only. Same-site or empty → `(direct)` |
| `blob3` | Device class: `phone`, `computer`, `other`. Map `cf.deviceType` `mobile`/`tablet` → `phone`, `desktop` → `computer`. Missing or anything else → `other` |
| `blob4` | US state code (`CA`) or `US` if country is US but region is missing |
| `blob5` | HTTP status as string (`200`) |
| `double1` | Always `1` so sampled writes still sum |

**Keep a point only if all are true:**

- Method is GET
- Host is `thenormal.space` or `shop.thenormal.space`
- Path is a document: not `/_astro`, and the last path segment does not end in `.woff2`, `.css`, `.js`, `.map`, `.png`, `.ico`, `.svg`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.txt`, `.xml`, `.json`
- Path does not contain `REDACTED` (drop the point; do not collapse it to `/`)
- Not a leftover bot (`cf.botManagement` verified-bot or definitely-automated when those fields exist)

WAF 403/429 never reach the Tail Worker. Those counts come from GraphQL only.

Never store IP, full UA, query string, cookies, city, or lat/long. Do not call `getUnredacted()` on tail events. Empty path after stripping → `/`.

### GraphQL

Zone `311f1a68293f44452ef3147ec6f4ea8b`.

`httpRequests1hGroups` / `httpRequests1dGroups` have `uniq.uniques` but **cannot filter by host**. Do not use them for the public visitors number. That number would include `api`, `auth`, `admin*`, and `stats`.

| Need | Dataset | Notes |
| --- | --- | --- |
| Visitors + visitor series | `httpRequestsAdaptiveGroups` | Filter `clientRequestHTTPHost_in: ["thenormal.space", "shop.thenormal.space"]` and `requestSource: eyeball`. Metric: `sum.visits`. Time dimension: `datetimeHour` (24h, 7d) or `date` (30d) |
| Blocked | `firewallEventsAdaptiveGroups` | Filter time + `action: "block"`. Map rows: `ruleId` `cf9ae583904041d18bdb7c8a433bdaa1` → `outsideUs`; `ruleId` `718db37fffd04b5e9a1c84e4cf47a293` → `vpnTor`; remaining blocks whose `source` is Super Bot Fight Mode / bot fight / AI bots → `bots`. Do not double-count the two custom rule IDs under bots |

Do not use GraphQL path breakdown for the pages list. AE owns pages, states, referrers, and devices. Adaptive HTTP analytics has country, not region; state is AE-only.

There is no unique-per-state number in v1. Hero **visitors** is Cloudflare visits for those two hosts, not unique IPs. Hero **pageviews** is AE. The two series can differ in magnitude; that is expected.

### Snapshot (KV)

Keys: `snapshot:24h`, `snapshot:7d`, `snapshot:30d`. Cron refreshes each about every 60 seconds.

```ts
type Range = "24h" | "7d" | "30d";

type Snapshot = {
  range: Range;
  generatedAt: string; // ISO
  visitors: number;
  pageviews: number;
  series: { t: string; visitors: number; pageviews: number }[];
  pages: { host: string; path: string; views: number }[];
  referrers: { host: string; views: number }[];
  devices: { class: "phone" | "computer" | "other"; views: number }[];
  states: { code: string; views: number }[]; // 51 entries (50 states + DC), zeros included for the map
  blocked: { outsideUs: number; vpnTor: number; bots: number };
};
```

**Grains:** 24h and 7d = hourly buckets. 30d = daily. Every AE query includes `timestamp >= now() - interval` for that range.

**Partial failure:** write a new KV snapshot only when both GraphQL and AE queries succeed. On either failure, leave the existing key untouched.

## Public page

`https://stats.thenormal.space` — no login.

Same visual family as the marketing site: `--bg` `#070707`, `--ink` `#F2F0EA`, Sora / Figtree / IBM Plex Mono, hairlines, no accent color, no theme toggle.

```
[ The Normal Space ]                    24h | 7d | 30d
  stats

  Visitors          Pageviews
  1,204             3,891

  [ visitors ──── / pageviews ····  time series        ]

  Pages                         Referrers
  /dishwasher        812        google.com        401
  /                 640        (direct)          318
  shop /product/…   290        t.co              74

  United States                 Devices
  [ simple 50-state fill ]      computer  62%
  CA  28%   TX  11%   …         phone     36%
                                other      2%

  Blocked
  outside US  4,102    VPN/Tor  891    bots  12,440
```

| Element | Behavior |
| --- | --- |
| Header | Wordmark + `stats`. Text link to `https://thenormal.space`. Range is three text controls, default 7d, URL `?range=24h\|7d\|30d` |
| Hero | Visitors (GraphQL `sum.visits` for the two hosts) and pageviews (AE). No period-over-period delta |
| Series | One chart, two series. Native hover/focus readout. `prefers-reduced-motion`: final state only |
| Pages | Top 20. Path as people know it (`/dishwasher`, `shop /checkout`) |
| Referrers | Top 15 hosts |
| States | Flat US map, fill = ink opacity from view share. List shows states with views > 0. Map shapes include zeros so the country still reads. Hover/focus is state + count only |
| Devices | computer / phone / other |
| Blocked | Literal labels: `Blocked outside the US`, `Blocked VPN or Tor`, `Blocked bots` |

**Not on the page:** live visitor pulse, session replay, funnels, raw logs, IPs, user agents, query strings, admin hosts, login.

**Empty:** “No page looks yet.” Layout stays; lists and chart use em dashes. Blocked can still have numbers on day one.

**Stale:** snapshot older than 10 minutes → mono line `Last updated {time}`. No snapshot → `Numbers are unavailable` and em dashes. Page still renders. HTML/CSS/JS are static assets; only `/api/snapshot` is dynamic.

## Components

| Unit | Does | Talks to |
| --- | --- | --- |
| `stats/tail` | Filter tail events, write AE | Producers via `tail_consumers`; AE binding `PAGEVIEWS` |
| `stats/app` fetch | Serve assets + `GET /api/snapshot` | KV `STATS` |
| `stats/app` scheduled | Build snapshots | AE SQL API, GraphQL API, KV |
| Snapshot builder | Pure function: AE rows + GraphQL JSON → `Snapshot` | Nothing |
| Page UI | Read snapshot JSON, render | `/api/snapshot` |
| Producer wrangler | Attach tail + `run_worker_first` | `thenormal-stats-tail` |

Someone can change AE SQL without touching the tail filter. Someone can restyle the page without touching the snapshot shape.

### Secrets and bindings

Stats app:

- Secret `CF_API_TOKEN` — Zone Analytics Read + Account Analytics Read (AE SQL uses the account analytics permission)
- Vars `CF_ACCOUNT_ID` (`97b0dab10c55d2e8a6c952eb4e4914ac`), `CF_ZONE_ID` (`311f1a68293f44452ef3147ec6f4ea8b`)
- KV `STATS`
- Cron `* * * * *` (every minute)

Tail:

- AE dataset binding `PAGEVIEWS` → `thenormal_pageviews`

## Failure

| What breaks | What the public sees | What we do |
| --- | --- | --- |
| Tail down or not attached | Visitors/blocked still update; pages/states/referrers empty | Explicit empty copy, not a fake “zero visitors” |
| AE write fails | Same; writes are not retried | Log on the tail Worker |
| GraphQL 429 or error | Last good snapshot | Cron leaves existing KV keys; page shows stale line if >10 min |
| KV empty (first deploy) | `Numbers are unavailable` | Cron retries next minute |
| WAF false positives | Real people blocked; stats drop | Rollback likely-automated to `managed_challenge`. Do not add a shop/marketing skip |
| Path redaction | That point is dropped | Never unredact |

`/api/snapshot` unknown or missing `range` → treat as `7d`. Never include secrets in responses. Cache-Control on the JSON: short (30–60s) so a refresh can pick up a new snapshot without hammering KV.

## Tests

- **Tail unit tests:** keep vs drop (asset, POST, wrong host, bot, `/_astro`, shop HTML GET). Blob mapping: query stripped, referrer host, state code, `(direct)`.
- **Snapshot builder tests:** fixture AE rows + GraphQL JSON → snapshot; range grains; 51 state codes; host filter excludes `stats` / `auth` / `api`.
- **Stats Worker HTTP tests:** `/` 200, `/api/snapshot?range=7d` 200, unknown range → 7d, no token leakage.
- **No local Tail integration test.** After deploy: GET `/`, `/dishwasher` on marketing and one shop product URL; wait for cron; load `stats.thenormal.space`. Written smoke checklist, not CI.

## Out of scope (v1)

- Client JS beacons, time-on-page, scroll, clicks
- City, map zoom, lat/long
- Counting API, auth, admin, or the stats host
- Unique visitors per state
- History from before this ships (AE starts empty)
- Alerting, CSV export, embed widget
- Changing the US-only or VPN/Tor rules
- Blocking verified search crawlers

## Deploy order

1. Create the AE dataset (first write also creates it), KV namespace, and API token.
2. Deploy `thenormal-stats-tail`.
3. Deploy producers with `tail_consumers` and `run_worker_first`.
4. Deploy `thenormal-stats` on `stats.thenormal.space`.
5. Tighten Super Bot Fight Mode (likely-automated + AI scrapers → block).
6. Smoke the three pages, wait a minute, load the dashboard.

## Voice

Literal, short. Labels name the thing: visitors, pageviews, blocked bots. Do not say “insights,” “engagement,” or “users in your funnel.”
