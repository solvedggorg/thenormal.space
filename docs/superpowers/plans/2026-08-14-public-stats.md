# Public Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public cookieless stats page at `https://stats.thenormal.space` that shows visitors, pageviews, paths, referrers, devices, a US state map, and blocked junk for `thenormal.space` and `shop.thenormal.space`.

**Architecture:** A Tail Worker on the marketing and shop Workers writes page looks to Analytics Engine. A separate stats Worker cron-queries AE SQL plus GraphQL Analytics, stores one JSON snapshot per range in KV, and serves a static page that reads `/api/snapshot`. Super Bot Fight Mode is tightened in the same change set.

**Tech Stack:** Cloudflare Workers, Tail Workers, Analytics Engine, GraphQL Analytics API, KV, Hono, bun:test. No client tracker. No new UI framework.

**Spec:** `docs/superpowers/specs/2026-08-14-public-stats-design.md`

## Global Constraints

- Count only `thenormal.space` and `shop.thenormal.space`. Never `api`, `auth`, `admin1`, `admin2`, `clerk`, `media`, or `stats`.
- No cookies, visitor IDs, IP, full UA, query string, city, or lat/long. Do not call `getUnredacted()`.
- Visitors = GraphQL `sum.visits` filtered to the two hosts + `requestSource: eyeball`. Pageviews = AE `SUM(double1)`. Do not use `httpRequests1hGroups.uniq` (cannot filter by host).
- State = `cf.regionCode`. Map + list. No country list.
- Ranges: `24h` | `7d` | `30d`. Default `7d`. URL `?range=`. 24h and 7d hourly; 30d daily.
- Voice: literal, short. Labels: visitors, pageviews, blocked outside the US, blocked VPN or Tor, blocked bots. No “insights” / “engagement.”
- Tokens: `--bg #070707`, `--ink #F2F0EA`, `--ink-soft #C4C1B8`, `--muted #8A8882`, `--line rgba(242, 240, 234, 0.12)`, fonts Sora / Figtree / IBM Plex Mono. No accent color, no theme toggle.
- WAF already live, do not change: US-only rule, VPN/Tor rule, auth skip. Do change: `sbfm_likely_automated` → `block`, `ai_bots_protection` → `block`. Verified search stays allow.
- Account `97b0dab10c55d2e8a6c952eb4e4914ac`. Zone `311f1a68293f44452ef3147ec6f4ea8b`.
- Blocked mapping: rule `cf9ae583904041d18bdb7c8a433bdaa1` → outsideUs; rule `718db37fffd04b5e9a1c84e4cf47a293` → vpnTor; remaining SBFM/botfight/AI bot blocks → bots.
- Tests: `bun test` like `api/`. Dev Node via `nix develop` / `AGENTS.md` when running wrangler.
- Deploy tail Worker before producers.

## File map

| File | Responsibility |
| --- | --- |
| `stats/package.json` | Private package: hono, wrangler, bun:test |
| `stats/tsconfig.json` | Same shape as `api/tsconfig.json` |
| `stats/src/schema.ts` | `Range`, `Snapshot`, `STATE_CODES`, `parseRange` |
| `stats/src/pageview.ts` | `isPageLook`, `toDataPoint` from a normalized request |
| `stats/src/pageview.test.ts` | Keep/drop + blob mapping |
| `stats/src/snapshot.ts` | `buildSnapshot` |
| `stats/src/snapshot.test.ts` | Snapshot shape, 51 states, host filter, grains |
| `stats/src/query.ts` | AE SQL + GraphQL fetch/parse |
| `stats/src/query.test.ts` | SQL text, GraphQL body, firewall bucket mapping |
| `stats/tail/wrangler.jsonc` | `thenormal-stats-tail` + AE binding |
| `stats/tail/src/index.ts` | `tail()` → `writeDataPoint` |
| `stats/tail/src/index.test.ts` | Maps a fake `TraceItem` through `toDataPoint` |
| `stats/app/wrangler.jsonc` | `thenormal-stats`, domain, KV, cron, assets |
| `stats/app/src/index.ts` | Hono fetch + scheduled |
| `stats/app/src/index.test.ts` | `/api/snapshot` range, KV miss, no token leak |
| `stats/app/public/index.html` | Page shell |
| `stats/app/public/styles.css` | Tokens + layout |
| `stats/app/public/app.js` | Fetch snapshot, render, range, chart, map |
| `stats/app/public/us.svg` | US states, `id` = two-letter code |
| `stats/app/public/fonts/*` | Copies of the six site woff2 files |
| `wrangler.jsonc` | `tail_consumers` + `run_worker_first` |
| `store/wrangler.jsonc` | Same |
| `package.json` | Add `stats` to the root `test` script |

Do not add a client beacon. Do not attach a tail consumer to the stats Worker.

---

### Task 1: Pageview filter and AE point

**Files:**
- Create: `stats/package.json`
- Create: `stats/tsconfig.json`
- Create: `stats/src/schema.ts`
- Create: `stats/src/pageview.ts`
- Test: `stats/src/pageview.test.ts`
- Modify: `package.json` — change `"test"` to `"bun test src api/test store/src auth/test stats"`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type Range = "24h" | "7d" | "30d"`
  - `export function parseRange(raw: string | null | undefined): Range`
  - `export const STATE_CODES: readonly string[]` — 50 states + `DC`
  - `export const COUNTED_HOSTS: readonly string[]` = `["thenormal.space", "shop.thenormal.space"]`
  - `export type PageRequest = { method: string; url: string; host: string; referer: string; deviceType: string | undefined; country: string | undefined; regionCode: string | undefined; status: number; verifiedBot: boolean; definitelyAutomated: boolean }`
  - `export function isPageLook(req: PageRequest): boolean`
  - `export type DataPoint = { indexes: [string]; blobs: [string, string, string, string, string]; doubles: [1] }`
  - `export function toDataPoint(req: PageRequest): DataPoint | null` — returns null when `!isPageLook(req)` or path contains `REDACTED`

- [ ] **Step 1: Write the failing tests**

`stats/src/pageview.test.ts`:

```ts
import { expect, test } from "bun:test";
import { isPageLook, parseRange, toDataPoint, type PageRequest } from "./pageview";

function req(over: Partial<PageRequest> = {}): PageRequest {
  return {
    method: "GET",
    url: "https://thenormal.space/dishwasher",
    host: "thenormal.space",
    referer: "",
    deviceType: "desktop",
    country: "US",
    regionCode: "CA",
    status: 200,
    verifiedBot: false,
    definitelyAutomated: false,
    ...over,
  };
}

test("parseRange defaults to 7d", () => {
  expect(parseRange(null)).toBe("7d");
  expect(parseRange("nope")).toBe("7d");
  expect(parseRange("24h")).toBe("24h");
  expect(parseRange("30d")).toBe("30d");
});

test("keeps a shop HTML GET", () => {
  expect(isPageLook(req({ url: "https://shop.thenormal.space/product/x", host: "shop.thenormal.space" }))).toBe(true);
});

test("drops assets, POST, wrong host, bots, _astro, REDACTED", () => {
  expect(isPageLook(req({ url: "https://thenormal.space/_astro/x.js" }))).toBe(false);
  expect(isPageLook(req({ url: "https://thenormal.space/fonts/sora-600.woff2" }))).toBe(false);
  expect(isPageLook(req({ url: "https://thenormal.space/favicon.ico" }))).toBe(false);
  expect(isPageLook(req({ method: "POST" }))).toBe(false);
  expect(isPageLook(req({ host: "api.thenormal.space", url: "https://api.thenormal.space/list/subscribe" }))).toBe(false);
  expect(isPageLook(req({ host: "stats.thenormal.space", url: "https://stats.thenormal.space/" }))).toBe(false);
  expect(isPageLook(req({ verifiedBot: true }))).toBe(false);
  expect(isPageLook(req({ definitelyAutomated: true }))).toBe(false);
  expect(toDataPoint(req({ url: "https://thenormal.space/user/REDACTED" }))).toBeNull();
});

test("maps blobs: path stripped, referrer host, device, state", () => {
  const point = toDataPoint(
    req({
      url: "https://thenormal.space/dishwasher?utm=1#why",
      referer: "https://www.google.com/search?q=normal",
      deviceType: "mobile",
      regionCode: "TX",
      status: 200,
    }),
  );
  expect(point).toEqual({
    indexes: ["thenormal.space"],
    blobs: ["/dishwasher", "www.google.com", "phone", "TX", "200"],
    doubles: [1],
  });
});

test("same-site and empty referrer are (direct); missing region is US", () => {
  const direct = toDataPoint(req({ referer: "https://thenormal.space/about" }));
  expect(direct?.blobs[1]).toBe("(direct)");
  const shopSelf = toDataPoint(
    req({ host: "shop.thenormal.space", url: "https://shop.thenormal.space/", referer: "https://shop.thenormal.space/cart" }),
  );
  expect(shopSelf?.blobs[1]).toBe("(direct)");
  expect(toDataPoint(req({ regionCode: undefined }))?.blobs[3]).toBe("US");
  expect(toDataPoint(req({ deviceType: undefined }))?.blobs[2]).toBe("other");
  expect(toDataPoint(req({ url: "https://thenormal.space/" }))?.blobs[0]).toBe("/");
});
```

Put `parseRange` in `schema.ts` and re-export it from `pageview.ts` (`export { parseRange } from "./schema"`) so this import path stays valid.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test stats/src/pageview.test.ts`

Expected: FAIL — `Cannot find module './pageview'`

- [ ] **Step 3: Write package scaffold + implementation**

`stats/package.json`:

```json
{
  "name": "thenormal-stats",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "types:tail": "wrangler types --config tail/wrangler.jsonc",
    "types:app": "wrangler types --config app/wrangler.jsonc --env-interface StatsEnv"
  },
  "dependencies": {
    "hono": "^4.13.1"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14",
    "typescript": "^5.9.0",
    "wrangler": "^4.123.0"
  }
}
```

`stats/tsconfig.json` — copy `api/tsconfig.json` (ES2022, bundler, bun types). Do not point at a missing `worker-configuration.d.ts` yet; use `"types": ["bun"]` until Task 3/5 generate types.

`stats/src/schema.ts`:

```ts
export type Range = "24h" | "7d" | "30d";

export const RANGES = ["24h", "7d", "30d"] as const;
export const COUNTED_HOSTS = ["thenormal.space", "shop.thenormal.space"] as const;

export function parseRange(raw: string | null | undefined): Range {
  if (raw === "24h" || raw === "7d" || raw === "30d") return raw;
  return "7d";
}

export const STATE_CODES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY",
] as const;

export type Snapshot = {
  range: Range;
  generatedAt: string;
  visitors: number;
  pageviews: number;
  series: { t: string; visitors: number; pageviews: number }[];
  pages: { host: string; path: string; views: number }[];
  referrers: { host: string; views: number }[];
  devices: { class: "phone" | "computer" | "other"; views: number }[];
  states: { code: string; views: number }[];
  blocked: { outsideUs: number; vpnTor: number; bots: number };
};
```

`stats/src/pageview.ts` — implement:

- Asset drop: path includes `/_astro` or the last segment matches `/\.(woff2|css|js|map|png|ico|svg|jpg|jpeg|webp|gif|txt|xml|json)$/i`
- Host must be in `COUNTED_HOSTS` (compare `host` lowercased, strip port)
- `toDataPoint` returns null if pathname includes `REDACTED`
- Path: `URL.pathname` only, max 256 chars
- Referrer host: parse `referer`; if missing/invalid or host is a counted host (with or without `www.` stripped? **do not strip www for google**; **do** treat `thenormal.space` and `shop.thenormal.space` only as same-site). `www.thenormal.space` is not a counted host today — if referer host ends with `.thenormal.space` or equals `thenormal.space`, use `(direct)`
- Device: `mobile`/`tablet` → `phone`; `desktop` → `computer`; else `other`
- State: `regionCode` if it matches `/^[A-Z]{2}$/`; else if `country === "US"` → `US`; else `US` still (geo rule means we should not see non-US page looks; still write `US` rather than a foreign code)

Re-export `parseRange` from `./schema`.

In root `package.json`, set:

```json
"test": "bun test src api/test store/src auth/test stats"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test stats/src/pageview.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add stats/package.json stats/tsconfig.json stats/src/schema.ts stats/src/pageview.ts stats/src/pageview.test.ts package.json
git commit -m "feat(stats): filter page looks and map Analytics Engine points"
```

---

### Task 2: Snapshot builder

**Files:**
- Create: `stats/src/snapshot.ts`
- Test: `stats/src/snapshot.test.ts`

**Interfaces:**
- Consumes: `Range`, `Snapshot`, `STATE_CODES`, `parseRange` from `stats/src/schema.ts`
- Produces:
  - `export type SeriesPoint = { t: string; visitors: number; pageviews: number }`
  - `export type SnapshotInput = { range: Range; generatedAt: string; visitors: number; pages: { host: string; path: string; views: number }[]; referrers: { host: string; views: number }[]; devices: { class: string; views: number }[]; states: { code: string; views: number }[]; pageviewSeries: { t: string; pageviews: number }[]; visitorSeries: { t: string; visitors: number }[]; blocked: { outsideUs: number; vpnTor: number; bots: number } }`
  - `export function buildSnapshot(input: SnapshotInput): Snapshot`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from "bun:test";
import { STATE_CODES } from "./schema";
import { buildSnapshot } from "./snapshot";

test("fills 51 states and ranks pages and referrers", () => {
  const snap = buildSnapshot({
    range: "7d",
    generatedAt: "2026-08-14T12:00:00.000Z",
    visitors: 12,
    pages: [
      { host: "thenormal.space", path: "/dishwasher", views: 8 },
      { host: "shop.thenormal.space", path: "/checkout", views: 3 },
      { host: "api.thenormal.space", path: "/list/subscribe", views: 99 },
    ],
    referrers: [
      { host: "google.com", views: 5 },
      { host: "(direct)", views: 4 },
    ],
    devices: [
      { class: "computer", views: 7 },
      { class: "phone", views: 4 },
      { class: "toaster", views: 1 },
    ],
    states: [{ code: "CA", views: 6 }, { code: "TX", views: 2 }],
    pageviewSeries: [{ t: "2026-08-13T00:00:00.000Z", pageviews: 4 }],
    visitorSeries: [{ t: "2026-08-13T00:00:00.000Z", visitors: 3 }],
    blocked: { outsideUs: 10, vpnTor: 2, bots: 8 },
  });
  expect(snap.states).toHaveLength(51);
  expect(snap.states.find((s) => s.code === "CA")?.views).toBe(6);
  expect(snap.states.find((s) => s.code === "WY")?.views).toBe(0);
  expect(snap.pages).toEqual([
    { host: "thenormal.space", path: "/dishwasher", views: 8 },
    { host: "shop.thenormal.space", path: "/checkout", views: 3 },
  ]);
  expect(snap.pageviews).toBe(11);
  expect(snap.devices).toEqual([
    { class: "computer", views: 7 },
    { class: "phone", views: 4 },
    { class: "other", views: 1 },
  ]);
  expect(snap.series).toEqual([{ t: "2026-08-13T00:00:00.000Z", visitors: 3, pageviews: 4 }]);
  expect(snap.visitors).toBe(12);
  expect(snap.blocked.bots).toBe(8);
  expect(STATE_CODES).toHaveLength(51);
});

test("caps pages at 20 and referrers at 15, sorted by views desc", () => {
  const pages = Array.from({ length: 25 }, (_, i) => ({
    host: "thenormal.space" as const,
    path: `/${i}`,
    views: i,
  }));
  const snap = buildSnapshot({
    range: "24h",
    generatedAt: "2026-08-14T12:00:00.000Z",
    visitors: 0,
    pages,
    referrers: Array.from({ length: 20 }, (_, i) => ({ host: `r${i}.com`, views: i })),
    devices: [],
    states: [],
    pageviewSeries: [],
    visitorSeries: [],
    blocked: { outsideUs: 0, vpnTor: 0, bots: 0 },
  });
  expect(snap.pages).toHaveLength(20);
  expect(snap.pages[0]?.path).toBe("/24");
  expect(snap.referrers).toHaveLength(15);
  expect(snap.referrers[0]?.host).toBe("r19.com");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test stats/src/snapshot.test.ts`

Expected: FAIL — `Cannot find module './snapshot'`

- [ ] **Step 3: Implement `buildSnapshot`**

Rules:

- Drop any `pages` / `referrers` whose `host` is not in `COUNTED_HOSTS` and, for referrers, allow any external host plus `(direct)` (referrer host is not a counted-host filter — only **page** host is). Pages: keep only `COUNTED_HOSTS`.
- `pageviews` = sum of kept page views (not GraphQL).
- Devices: map unknown class to `other` and merge.
- States: start from `STATE_CODES` at 0; add views for known codes only; ignore `US` as a map state (do not create a 52nd row). If input has `US`, discard those views for the map (they still sit in pageviews via pages).
- Series: union of timestamps from both series arrays, sort ascending, missing side = 0.
- Sort pages and referrers by `views` desc, slice 20 / 15.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test stats/src/snapshot.test.ts stats/src/pageview.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add stats/src/snapshot.ts stats/src/snapshot.test.ts
git commit -m "feat(stats): build public snapshot from AE and GraphQL rows"
```

---

### Task 3: Tail Worker

**Files:**
- Create: `stats/tail/wrangler.jsonc`
- Create: `stats/tail/src/index.ts`
- Test: `stats/tail/src/index.test.ts`

**Interfaces:**
- Consumes: `isPageLook`, `toDataPoint`, `PageRequest` from `stats/src/pageview.ts`
- Produces:
  - `export function requestFromTrace(event: TraceLike): PageRequest | null`
  - `export function writeFromEvents(events: TraceLike[], analytics: { writeDataPoint(point: unknown): void }): number`
  - default export `{ tail(events, env) }`
  - Wrangler name `thenormal-stats-tail`

`TraceLike` (define in `stats/tail/src/index.ts` and export it):

```ts
export type TraceLike = {
  event?: {
    request?: {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      cf?: {
        country?: string;
        regionCode?: string;
        deviceType?: string;
        botManagement?: { verifiedBot?: boolean; score?: number };
      };
    };
    response?: { status?: number };
  };
};
```

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from "bun:test";
import { requestFromTrace, writeFromEvents, type TraceLike } from "./index";

function trace(over: TraceLike = {}): TraceLike {
  return {
    event: {
      request: {
        url: "https://thenormal.space/about",
        method: "GET",
        headers: { referer: "https://t.co/x" },
        cf: { country: "US", regionCode: "NY", deviceType: "desktop", botManagement: { verifiedBot: false, score: 99 } },
        ...over.event?.request,
      },
      response: { status: 200, ...over.event?.response },
    },
  };
}

test("requestFromTrace maps cf and headers", () => {
  const req = requestFromTrace(trace());
  expect(req?.host).toBe("thenormal.space");
  expect(req?.referer).toBe("https://t.co/x");
  expect(req?.regionCode).toBe("NY");
  expect(req?.verifiedBot).toBe(false);
  expect(req?.definitelyAutomated).toBe(false);
});

test("score 1 is definitely automated", () => {
  const req = requestFromTrace(
    trace({ event: { request: { cf: { botManagement: { score: 1 } } } } }),
  );
  expect(req?.definitelyAutomated).toBe(true);
});

test("writeFromEvents writes one point for a page look and skips assets", () => {
  const written: unknown[] = [];
  const n = writeFromEvents(
    [
      trace(),
      trace({ event: { request: { url: "https://thenormal.space/favicon.ico" } } }),
    ],
    { writeDataPoint: (p) => written.push(p) },
  );
  expect(n).toBe(1);
  expect(written).toHaveLength(1);
});
```

Header lookup must be case-insensitive (`Referer` vs `referer`).

`definitelyAutomated`: `cf.botManagement.score === 1` OR a boolean if present. Missing botManagement → not a bot.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test stats/tail/src/index.test.ts`

Expected: FAIL — cannot find module

- [ ] **Step 3: Implement tail Worker**

`stats/tail/wrangler.jsonc`:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "thenormal-stats-tail",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-14",
  "observability": { "enabled": true },
  "analytics_engine_datasets": [
    { "binding": "PAGEVIEWS", "dataset": "thenormal_pageviews" }
  ]
}
```

`stats/tail/src/index.ts`:

- `requestFromTrace`: if no `request.url`, return null. `host` from `new URL(url).host` (strip port). `verifiedBot` from `cf.botManagement.verifiedBot === true`. `definitelyAutomated` from `score === 1`.
- `writeFromEvents`: for each event, map → `toDataPoint` → `analytics.writeDataPoint(point)`. Return count written. No await.
- `export default { tail(events, env) { writeFromEvents(events, env.PAGEVIEWS); } }`

Do not log the raw URL or headers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test stats/tail/src/index.test.ts stats/src/pageview.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add stats/tail
git commit -m "feat(stats): write page looks from the Tail Worker"
```

---

### Task 4: AE SQL and GraphQL queries

**Files:**
- Create: `stats/src/query.ts`
- Test: `stats/src/query.test.ts`

**Interfaces:**
- Consumes: `Range`, `COUNTED_HOSTS` from `stats/src/schema.ts`; `SnapshotInput` fields from Task 2
- Produces:
  - `export const RULE_OUTSIDE_US = "cf9ae583904041d18bdb7c8a433bdaa1"`
  - `export const RULE_VPN_TOR = "718db37fffd04b5e9a1c84e4cf47a293"`
  - `export const BOT_SOURCES = ["sbfm", "botfight", "botmanagement", "aibot"]` as lowercase needles
  - `export function rangeStart(range: Range, now: Date): Date` — 24h = now-24h, 7d = now-7d, 30d = now-30d
  - `export function aeSql(range: Range, now: Date): { pages: string; referrers: string; devices: string; states: string; series: string }`
  - `export function visitsQuery(range: Range, startIso: string, endIso: string): string`
  - `export function firewallQuery(startIso: string, endIso: string): string`
  - `export function parseAeTable(json: unknown, keys: string[]): Record<string, string | number>[]` — Cloudflare SQL API returns `{ data: rows }` or `{ result: [ { data } ] }`; accept `{ data: Array<Record<string, unknown>> }`
  - `export function bucketFirewall(rows: { ruleId?: string; source?: string; count: number }[]): { outsideUs: number; vpnTor: number; bots: number }`
  - `export function parseVisits(gql: unknown): { total: number; series: { t: string; visitors: number }[] }`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from "bun:test";
import {
  RULE_OUTSIDE_US,
  RULE_VPN_TOR,
  aeSql,
  bucketFirewall,
  parseVisits,
  rangeStart,
  visitsQuery,
} from "./query";

test("rangeStart is 24 hours / 7 days / 30 days back", () => {
  const now = new Date("2026-08-14T12:00:00.000Z");
  expect(rangeStart("24h", now).toISOString()).toBe("2026-08-13T12:00:00.000Z");
  expect(rangeStart("7d", now).toISOString()).toBe("2026-08-07T12:00:00.000Z");
  expect(rangeStart("30d", now).toISOString()).toBe("2026-07-15T12:00:00.000Z");
});

test("aeSql names dataset and groups the right blobs", () => {
  const sql = aeSql("7d", new Date("2026-08-14T12:00:00.000Z"));
  expect(sql.pages).toContain("FROM thenormal_pageviews");
  expect(sql.pages).toContain("index1");
  expect(sql.pages).toContain("blob1");
  expect(sql.referrers).toContain("blob2");
  expect(sql.devices).toContain("blob3");
  expect(sql.states).toContain("blob4");
  expect(sql.series).toContain("toStartOfHour");
});

test("30d series uses start of day", () => {
  const sql = aeSql("30d", new Date("2026-08-14T12:00:00.000Z"));
  expect(sql.series).toContain("toStartOfDay");
});

test("visitsQuery filters the two hosts and eyeball", () => {
  const q = visitsQuery("7d", "2026-08-07T12:00:00Z", "2026-08-14T12:00:00Z");
  expect(q).toContain("httpRequestsAdaptiveGroups");
  expect(q).toContain("thenormal.space");
  expect(q).toContain("shop.thenormal.space");
  expect(q).toContain("eyeball");
  expect(q).toContain("datetimeHour");
  expect(q).not.toContain("httpRequests1hGroups");
});

test("bucketFirewall maps rule ids and bot sources", () => {
  expect(
    bucketFirewall([
      { ruleId: RULE_OUTSIDE_US, source: "firewallcustom", count: 10 },
      { ruleId: RULE_VPN_TOR, source: "firewallcustom", count: 3 },
      { ruleId: "abc", source: "sbfm", count: 4 },
      { ruleId: "def", source: "l7ddos", count: 9 },
    ]),
  ).toEqual({ outsideUs: 10, vpnTor: 3, bots: 4 });
});

test("parseVisits sums visits and keeps hourly series", () => {
  const parsed = parseVisits({
    data: {
      viewer: {
        zones: [
          {
            httpRequestsAdaptiveGroups: [
              { sum: { visits: 5 }, dimensions: { datetimeHour: "2026-08-14T10:00:00Z" } },
              { sum: { visits: 7 }, dimensions: { datetimeHour: "2026-08-14T11:00:00Z" } },
            ],
          },
        ],
      },
    },
  });
  expect(parsed.total).toBe(12);
  expect(parsed.series).toHaveLength(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test stats/src/query.test.ts`

Expected: FAIL — cannot find module

- [ ] **Step 3: Implement queries**

AE SQL (use `SUM(_sample_interval * double1)` as views so sampling is correct; alias `views`). Filter `timestamp >= toDateTime('{iso without Z, space instead of T}')` **or** `timestamp >= NOW() - INTERVAL '7' DAY` matching range. Prefer `NOW() - INTERVAL` so we do not depend on clock formatting:

- 24h: `INTERVAL '1' DAY` is wrong (that's 24h calendar-ish). Use `INTERVAL '24' HOUR`.
- 7d: `INTERVAL '7' DAY`
- 30d: `INTERVAL '30' DAY`

`pages`:

```sql
SELECT index1 AS host, blob1 AS path, SUM(_sample_interval * double1) AS views
FROM thenormal_pageviews
WHERE timestamp >= NOW() - INTERVAL '7' DAY
GROUP BY host, path
ORDER BY views DESC
LIMIT 50
```

Referrers group `blob2`. Devices group `blob3`. States group `blob4`. Series:

```sql
SELECT toStartOfHour(timestamp) AS t, SUM(_sample_interval * double1) AS pageviews
FROM thenormal_pageviews
WHERE timestamp >= NOW() - INTERVAL '7' DAY
GROUP BY t
ORDER BY t ASC
```

GraphQL visits (24h/7d use `datetimeHour`; 30d use `date` and filter `date_geq` / `date_leq`):

```graphql
query Visits($zoneTag: string!, $start: Time!, $end: Time!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequestsAdaptiveGroups(
        filter: {
          datetime_geq: $start
          datetime_lt: $end
          requestSource: "eyeball"
          clientRequestHTTPHost_in: ["thenormal.space", "shop.thenormal.space"]
        }
        limit: 1000
        orderBy: [datetimeHour_ASC]
      ) {
        sum { visits }
        dimensions { datetimeHour }
      }
    }
  }
}
```

For 30d, `dimensions { date }`, `orderBy: [date_ASC]`, filter `date_geq` / `date_leq`.

Firewall query: `firewallEventsAdaptiveGroups` with `action: "block"`, `limit: 100`, `orderBy: [count_DESC]`, select `count` and `dimensions { ruleId source }`.

`bucketFirewall`: lowercase `source`; if `ruleId` is the US or VPN id, add there and **do not** also add to bots. Else if `source` includes any `BOT_SOURCES` needle, add to bots. Else ignore (DDoS etc.).

`parseVisits`: walk `data.viewer.zones[0].httpRequestsAdaptiveGroups`; `t` = `datetimeHour` or `date`; coerce `date` to `YYYY-MM-DDT00:00:00.000Z`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test stats/src/query.test.ts stats/src/snapshot.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add stats/src/query.ts stats/src/query.test.ts
git commit -m "feat(stats): query Analytics Engine and GraphQL visits"
```

---

### Task 5: Stats Worker fetch and cron

**Files:**
- Create: `stats/app/wrangler.jsonc`
- Create: `stats/app/src/index.ts`
- Test: `stats/app/src/index.test.ts`

**Interfaces:**
- Consumes: `parseRange`, `Snapshot` from `stats/src/schema.ts`; `buildSnapshot` from `stats/src/snapshot.ts`; `aeSql`, `visitsQuery`, `firewallQuery`, `parseAeTable`, `parseVisits`, `bucketFirewall`, `rangeStart` from `stats/src/query.ts`
- Produces:
  - `export const app` Hono instance
  - `GET /api/snapshot` → last complete `Snapshot` JSON for `parseRange(range)`
  - `export async function buildAndStore(env: StatsBindings, now?: Date): Promise<boolean>`
  - `export default { fetch, scheduled }`
  - KV keys `snapshot:24h` | `snapshot:7d` | `snapshot:30d`
  - Worker name `thenormal-stats`, route `stats.thenormal.space`

- [ ] **Step 1: Write the failing tests**

Use a memory KV like `api/test/env.ts` `createMemoryKv`.

```ts
import { expect, test } from "bun:test";
import { app, buildAndStore } from "./index";

function memoryKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, type?: string) {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === "json") return JSON.parse(value);
      return value;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

test("unknown range is 7d; missing snapshot is 200 with unavailable", async () => {
  const STATS = memoryKv();
  const res = await app.request("https://stats.thenormal.space/api/snapshot?range=nope", {}, { STATS } as never);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.range).toBe("7d");
  expect(body.unavailable).toBe(true);
  expect(JSON.stringify(body)).not.toContain("secret");
});

test("serves stored snapshot and does not leak the token", async () => {
  const STATS = memoryKv();
  await STATS.put(
    "snapshot:24h",
    JSON.stringify({
      range: "24h",
      generatedAt: "2026-08-14T12:00:00.000Z",
      visitors: 1,
      pageviews: 2,
      series: [],
      pages: [],
      referrers: [],
      devices: [],
      states: [],
      blocked: { outsideUs: 0, vpnTor: 0, bots: 0 },
    }),
  );
  const res = await app.request(
    "https://stats.thenormal.space/api/snapshot?range=24h",
    {},
    { STATS, CF_API_TOKEN: "secret-token" } as never,
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("max-age=30");
  const text = await res.text();
  expect(text).toContain("\"visitors\":1");
  expect(text).not.toContain("secret-token");
});

test("buildAndStore writes only when both fetches succeed", async () => {
  const STATS = memoryKv();
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("analytics_engine/sql")) {
      return Response.json({ data: [] });
    }
    if (url.includes("graphql")) {
      return Response.json({
        data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [], firewallEventsAdaptiveGroups: [] }] } },
      });
    }
    return new Response("no", { status: 404 });
  }) as typeof fetch;
  try {
    const ok = await buildAndStore({
      STATS,
      CF_API_TOKEN: "t",
      CF_ACCOUNT_ID: "acct",
      CF_ZONE_ID: "zone",
    } as never);
    expect(ok).toBe(true);
    expect(STATS.store.has("snapshot:7d")).toBe(true);
  } finally {
    globalThis.fetch = original;
  }
});

test("buildAndStore keeps old snapshot when GraphQL fails", async () => {
  const STATS = memoryKv();
  await STATS.put("snapshot:7d", JSON.stringify({ range: "7d", keep: true }));
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("graphql")) return new Response("nope", { status: 429 });
    return Response.json({ data: [] });
  }) as typeof fetch;
  try {
    const ok = await buildAndStore({
      STATS,
      CF_API_TOKEN: "t",
      CF_ACCOUNT_ID: "acct",
      CF_ZONE_ID: "zone",
    } as never);
    expect(ok).toBe(false);
    expect(JSON.parse((await STATS.get("snapshot:7d"))!)).toEqual({ range: "7d", keep: true });
  } finally {
    globalThis.fetch = original;
  }
});
```

Hono `app.request` third argument is the bindings env.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test stats/app/src/index.test.ts`

Expected: FAIL — cannot find module

- [ ] **Step 3: Implement the Worker**

`stats/app/wrangler.jsonc`:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "thenormal-stats",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-14",
  "observability": { "enabled": true },
  "routes": [{ "pattern": "stats.thenormal.space", "custom_domain": true }],
  "assets": { "directory": "./public", "binding": "ASSETS" },
  "kv_namespaces": [{ "binding": "STATS" }],
  "triggers": { "crons": ["* * * * *"] },
  "vars": {
    "CF_ACCOUNT_ID": "97b0dab10c55d2e8a6c952eb4e4914ac",
    "CF_ZONE_ID": "311f1a68293f44452ef3147ec6f4ea8b"
  }
}
```

Leave KV `id` unset so wrangler can remote-provision on first deploy; if this workspace requires an id, run `wrangler kv namespace create STATS` in the deploy task and paste it. Do not invent an id.

`buildAndStore`:

1. For each range in `["24h","7d","30d"]`, run five AE SQL posts + two GraphQL posts (visits + firewall). If any response `!ok` or GraphQL `errors`, return `false` without writing that range (other ranges already written this tick may stay — **only write a range after its own queries succeed**; do not delete siblings).
2. AE endpoint: `POST https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql` with body = SQL string, header `Authorization: Bearer ${env.CF_API_TOKEN}`, `Content-Type: text/plain`.
3. GraphQL: `POST https://api.cloudflare.com/client/v4/graphql` JSON `{ query }`.
4. Map AE rows through `parseAeTable`. Build `SnapshotInput` → `buildSnapshot` → `STATS.put("snapshot:"+range, JSON.stringify(snap))`.
5. Return `true` only if all three ranges wrote.

`GET /api/snapshot`:

- `parseRange` from query
- `const snap = await c.env.STATS.get("snapshot:"+range, "json")`
- If missing: `{ range, unavailable: true, generatedAt: null, visitors: 0, pageviews: 0, series: [], pages: [], referrers: [], devices: [], states: [], blocked: { outsideUs: 0, vpnTor: 0, bots: 0 } }`
- Headers: `Cache-Control: public, max-age=30`, `Content-Type: application/json`
- Security headers same spirit as `api/src/security.ts` (`nosniff`, `referrer no-referrer`, `DENY` frame)

`fetch`: if path starts with `/api/`, Hono. Else `env.ASSETS.fetch(request)`.

`scheduled`: `await buildAndStore(env)` (scheduled **may** await).

Do not put `CF_API_TOKEN` on `vars`. Secret is set at deploy.

Create `stats/app/public/.gitkeep` so the assets directory exists until Task 6.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test stats/app/src/index.test.ts stats/src`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add stats/app/wrangler.jsonc stats/app/src stats/app/public/.gitkeep
git commit -m "feat(stats): serve snapshots from KV and refresh on cron"
```

---

### Task 6: Public page

**Files:**
- Create: `stats/app/public/index.html`
- Create: `stats/app/public/styles.css`
- Create: `stats/app/public/app.js`
- Create: `stats/app/public/us.svg`
- Create: `stats/app/public/fonts/` — copy the six files from `public/fonts/`
- Test: `stats/src/ui.test.ts` plus `stats/src/ui.ts` for formatters used by `app.js` (keep logic in TS, duplicate the tiny functions in `app.js` **or** build one IIFE — **do not add a bundler**. Put the tested helpers in `stats/src/ui.ts` and **copy their bodies** into `app.js` so the browser file stays a single classic script. Tests lock the TS copy; the review step diffs the two for drift.)

**Interfaces:**
- Consumes: `Snapshot` JSON from `/api/snapshot`
- Produces:
  - `export function formatPath(host: string, path: string): string` — if host is `shop.thenormal.space`, return `shop ${path}`; else return `path`
  - `export function isStale(generatedAt: string | null, nowMs: number): boolean` — true when missing or `nowMs - Date.parse(generatedAt) > 10 * 60 * 1000`
  - `export function fillOpacity(views: number, max: number): number` — 0.08 if views=0; else `0.2 + 0.8 * (views/max)` clamped 0.2–1
  - Page at `/` with range controls, hero, series SVG, lists, map, devices, blocked strip

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from "bun:test";
import { fillOpacity, formatPath, isStale } from "./ui";

test("formatPath prefixes shop", () => {
  expect(formatPath("thenormal.space", "/dishwasher")).toBe("/dishwasher");
  expect(formatPath("shop.thenormal.space", "/checkout")).toBe("shop /checkout");
});

test("isStale after ten minutes", () => {
  const t = Date.parse("2026-08-14T12:00:00.000Z");
  expect(isStale("2026-08-14T11:49:00.000Z", t)).toBe(true);
  expect(isStale("2026-08-14T11:51:00.000Z", t)).toBe(false);
  expect(isStale(null, t)).toBe(true);
});

test("fillOpacity", () => {
  expect(fillOpacity(0, 10)).toBe(0.08);
  expect(fillOpacity(10, 10)).toBe(1);
  expect(fillOpacity(5, 10)).toBe(0.6);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test stats/src/ui.test.ts`

Expected: FAIL — cannot find module

- [ ] **Step 3: Implement UI helpers and the page**

`stats/src/ui.ts` — the three functions exactly as tested.

`app.js` must contain the same three function bodies (not imports). After writing both, run:

```bash
python3 - <<'PY'
from pathlib import Path
js = Path("stats/app/public/app.js").read_text()
for name in ("formatPath", "isStale", "fillOpacity"):
    assert f"function {name}" in js, name
print("ok")
PY
```

**HTML structure** (`index.html`):

- `<html lang="en">`, title `Stats | The Normal Space`
- Header: `<a href="https://thenormal.space">The Normal Space</a>` and `<p>stats</p>`
- Nav of three links: `?range=24h`, `?range=7d`, `?range=30d` with `aria-current` on the active one
- `#status` for stale / unavailable / empty
- `#visitors` `#pageviews`
- `<svg id="series">` 640×160, two polylines
- `#pages` `#referrers` as `<ol>`
- object or inline `<div id="map">` that fetches `/us.svg` and injects it
- `#devices` `#blocked`
- `<script src="/app.js" type="module"` **no** — use `<script src="/app.js" defer>` classic script

Copy verbatim labels: `Blocked outside the US`, `Blocked VPN or Tor`, `Blocked bots`. Empty list copy: `No page looks yet.` Unavailable: `Numbers are unavailable`. Stale: `Last updated ` + ISO trimmed to minutes UTC.

**CSS:** copy `:root` tokens from `src/styles/global.css` (bg, ink, ink-soft, muted, line, fonts). `@font-face` pointing at `/fonts/*.woff2`. Dark body, max-width ~1180px, hairline borders, two-column lists, no accent color. Map paths: `fill: var(--ink); stroke: var(--bg);`. `prefers-reduced-motion: reduce` — no CSS transitions.

**us.svg:** vendor a public-domain US states SVG whose path `id`s are two-letter codes (`CA`, `TX`, …, `DC`). Use Wikimedia `Blank US Map (states only)` if the ids already match; if they do not, rename them in the file. Do not use city dots.

**app.js behavior:**

1. `const range = parseRange(new URLSearchParams(location.search).get("range"))` (inline the same three-way check as `schema.ts`)
2. `fetch("/api/snapshot?range="+range)`
3. If `unavailable` or empty `pages`, set `#status` accordingly; still fill blocked if numbers > 0
4. Draw series: visitors and pageviews as two polylines from `series[]`; if `prefers-reduced-motion`, skip any dash animation (there should be none)
5. For each state path in the SVG, `style.fillOpacity = fillOpacity(views, max)`
6. Mark the active range link

Copy the six font files:

```bash
mkdir -p stats/app/public/fonts
cp public/fonts/*.woff2 stats/app/public/fonts/
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test stats/src/ui.test.ts` and the python assert above.

Expected: PASS and `ok`

- [ ] **Step 5: Commit**

```bash
git add stats/src/ui.ts stats/src/ui.test.ts stats/app/public
git commit -m "feat(stats): public dashboard page with state map"
```

---

### Task 7: Attach the Tail Worker to producers

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `store/wrangler.jsonc`

**Interfaces:**
- Consumes: Worker name `thenormal-stats-tail` from Task 3
- Produces: both producers list that tail consumer and run the Worker first so HTML assets are tailed

- [ ] **Step 1: Write a failing lock test**

Create `stats/src/producers.test.ts`:

```ts
import { expect, test } from "bun:test";
import site from "../../wrangler.jsonc";
import shop from "../../store/wrangler.jsonc";

test("producers tail into thenormal-stats-tail and run the worker first", () => {
  expect(site.tail_consumers).toEqual([{ service: "thenormal-stats-tail" }]);
  expect(shop.tail_consumers).toEqual([{ service: "thenormal-stats-tail" }]);
  expect(site.assets.run_worker_first).toBe(true);
  expect(shop.assets.run_worker_first).toBe(true);
});
```

Bun can import JSONC if the file is valid JSON with comments — wrangler files here are JSONC with a `$schema` and no comments except possibly none. If import fails on `$schema`-only JSONC, read the files with `Bun.file(...).text()` and `JSON.parse` after stripping `//` lines. Prefer `JSON.parse` of the raw text if `import` chokes.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test stats/src/producers.test.ts`

Expected: FAIL — `tail_consumers` undefined

- [ ] **Step 3: Patch both wrangler files**

Root `wrangler.jsonc` — add next to `assets`:

```jsonc
"assets": {
  "directory": "./dist",
  "binding": "ASSETS",
  "run_worker_first": true
},
"tail_consumers": [
  { "service": "thenormal-stats-tail" }
]
```

`store/wrangler.jsonc` — same two keys on its existing `assets` object, plus `tail_consumers`.

Do not add a tail consumer to `api/`, `auth/`, or `stats/app`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test stats/src/producers.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add wrangler.jsonc store/wrangler.jsonc stats/src/producers.test.ts
git commit -m "feat(stats): tail marketing and shop page looks"
```

---

### Task 8: WAF tighten and deploy smoke

**Files:**
- Create: `stats/scripts/tighten-bots.sh`
- Create: `stats/SMOKE.md`

**Interfaces:**
- Consumes: zone `311f1a68293f44452ef3147ec6f4ea8b`; current bot settings from the spec
- Produces: documented deploy order and a script that PUTs Super Bot Fight Mode without touching US-only, VPN, or auth skip

- [ ] **Step 1: Write the script with a dry-run default**

`stats/scripts/tighten-bots.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ZONE=311f1a68293f44452ef3147ec6f4ea8b
# Requires CLOUDFLARE_API_TOKEN in the environment. Does not print the token.
BODY='{"sbfm_likely_automated":"block","ai_bots_protection":"block"}'
if [[ "${1:-}" != "--apply" ]]; then
  echo "dry-run PUT /zones/${ZONE}/bot_management"
  echo "$BODY"
  echo "re-run with --apply to send"
  exit 0
fi
curl -sS -X PUT "https://api.cloudflare.com/client/v4/zones/${ZONE}/bot_management" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$BODY"
echo
```

Note: Cloudflare’s bot_management PUT may require the full object. If a PUT of two fields 400s, GET the current resource, merge `sbfm_likely_automated` and `ai_bots_protection`, PUT the merged JSON (still never echo the token). Keep verified bots allow, definitely automated block, auth skip untouched.

`stats/SMOKE.md`:

```markdown
# Stats smoke

1. `cd stats/tail && wrangler deploy`
2. Deploy marketing (`wrangler deploy` at repo root) and shop (`cd store && wrangler deploy`)
3. `cd stats/app && wrangler kv namespace create STATS` if the binding has no id; paste id into `wrangler.jsonc`
4. `cd stats/app && wrangler secret put CF_API_TOKEN` (Zone Analytics Read + Account Analytics Read)
5. `cd stats/app && wrangler deploy`
6. `stats/scripts/tighten-bots.sh --apply`
7. `curl -sI https://thenormal.space/dishwasher` and `curl -sI https://shop.thenormal.space/`
8. Wait 60s. `curl -s 'https://stats.thenormal.space/api/snapshot?range=7d' | head`
9. Open `https://stats.thenormal.space` — visitors/blocked may be non-zero immediately; pages/states fill after the tail writes land (about a minute)
```

Token scopes: **Zone Analytics Read** and **Account Analytics Read**. Not Zone Settings Write except for the one-time bot PUT (that call needs **Zone Bot Management / Zone Settings Write** or run it from an already-authenticated dashboard session). If the token used by the Worker must stay read-only, run the bot PUT with a separate admin token and do not store that token as `CF_API_TOKEN` on the stats Worker.

- [ ] **Step 2: Run the dry-run**

Run: `bash stats/scripts/tighten-bots.sh`

Expected: prints the JSON body and does not call the network (no `--apply`).

- [ ] **Step 3: chmod +x the script**

```bash
chmod +x stats/scripts/tighten-bots.sh
```

- [ ] **Step 4: Run the full unit suite**

Run: `bun test stats`

Expected: PASS all tasks’ tests.

- [ ] **Step 5: Commit**

```bash
git add stats/scripts/tighten-bots.sh stats/SMOKE.md
git commit -m "chore(stats): bot fight tighten script and deploy smoke list"
```

Do not run `--apply` and do not deploy from this task unless the human asks. The smoke list is the handoff.

---

## Self-review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| Hosts counted / not counted | 1, 2, 4, 7 |
| Visitors = host-filtered `sum.visits` | 4, 5 |
| Pageviews = AE | 1, 2, 4 |
| State map + list, no city | 1, 2, 6 |
| Ranges 24h/7d/30d, default 7d | 1, 2, 5, 6 |
| Tail + AE + GraphQL + KV | 3, 4, 5 |
| `run_worker_first` + tail_consumers | 7 |
| Empty / stale / unavailable | 5, 6 |
| Stats host not counted | 1, 5, 7 |
| WAF likely-automated + AI block | 8 |
| US-only / VPN / auth skip unchanged | 8 (script does not touch them) |
| Tests | 1–7 |
| Deploy order | 8 |
| Voice + tokens | 6 |

**Placeholders:** none. Bot PUT may need a GET-merge if the API rejects a partial body; the script step says how.

**Types:** `Range`, `Snapshot`, `PageRequest`, `DataPoint`, `TraceLike`, `SnapshotInput` are named once in Task 1–3 and reused.
