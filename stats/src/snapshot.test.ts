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
    states: [
      { code: "CA", views: 6 },
      { code: "TX", views: 2 },
    ],
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
  expect(snap.pageviews).toBe(4);
  expect(snap.devices).toEqual([
    { class: "computer", views: 7 },
    { class: "phone", views: 4 },
    { class: "other", views: 1 },
  ]);
  expect(snap.series).toEqual([
    { t: "2026-08-13T00:00:00.000Z", visitors: 3, pageviews: 4 },
  ]);
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
    referrers: Array.from({ length: 20 }, (_, i) => ({
      host: `r${i}.com`,
      views: i,
    })),
    devices: [],
    states: [],
    pageviewSeries: [
      { t: "2026-08-13T00:00:00.000Z", pageviews: 200 },
      { t: "2026-08-13T01:00:00.000Z", pageviews: 121 },
    ],
    visitorSeries: [],
    blocked: { outsideUs: 0, vpnTor: 0, bots: 0 },
  });
  expect(snap.pages).toHaveLength(20);
  expect(snap.pages[0]?.path).toBe("/24");
  // Series has no LIMIT; do not sum the ranked page slice (top 20 of 0..24 = 290).
  expect(snap.pageviews).toBe(321);
  expect(snap.referrers).toHaveLength(15);
  expect(snap.referrers[0]?.host).toBe("r19.com");
});
