import { expect, test } from "bun:test";
import { STATE_CODES } from "./schema";
import { blockedDisplay, fillOpacity, formatPath, isStale } from "../app/public/app.js";

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

test("blockedDisplay dashes when unavailable", () => {
  expect(blockedDisplay(true, { outsideUs: 0, vpnTor: 0, bots: 0 })).toEqual({
    outsideUs: "—",
    vpnTor: "—",
    bots: "—",
  });
  expect(blockedDisplay(false, { outsideUs: 0, vpnTor: 4102, bots: 8 })).toEqual({
    outsideUs: "0",
    vpnTor: "4,102",
    bots: "8",
  });
  expect(blockedDisplay(false, { outsideUs: 0, vpnTor: 0, bots: 0 })).toEqual({
    outsideUs: "0",
    vpnTor: "0",
    bots: "0",
  });
});

test("fillOpacity clamps above one", () => {
  expect(fillOpacity(20, 10)).toBe(1);
});

test("isStale at exactly ten minutes is fresh", () => {
  const t = Date.parse("2026-08-14T12:00:00.000Z");
  expect(isStale("2026-08-14T11:50:00.000Z", t)).toBe(false);
});

test("page shell has required labels and no beacon", async () => {
  const html = await Bun.file(new URL("../app/public/index.html", import.meta.url)).text();
  const js = await Bun.file(new URL("../app/public/app.js", import.meta.url)).text();
  expect(html).toContain('<html lang="en">');
  expect(html).toContain("Stats | The Normal Space");
  expect(html).toContain('<a href="https://thenormal.space">The Normal Space</a>');
  expect(html).toContain("<p>stats</p>");
  expect(html).toContain("?range=24h");
  expect(html).toContain("?range=7d");
  expect(html).toContain("?range=30d");
  expect(html).toContain('id="status"');
  expect(html).toContain('id="visitors"');
  expect(html).toContain('id="pageviews"');
  expect(html).toContain('<svg id="series"');
  expect(html).toContain('id="pages"');
  expect(html).toContain('id="referrers"');
  expect(html).toContain('id="map"');
  expect(html).toContain('id="devices"');
  expect(html).toContain('id="blocked"');
  expect(html).toContain("Blocked outside the US");
  expect(html).toContain("Blocked VPN or Tor");
  expect(html).toContain("Blocked bots");
  expect(html).toContain('<script type="module" src="/app.js">');
  expect(html).not.toContain("sendBeacon");
  expect(js).not.toContain("sendBeacon");
  expect(js).toContain('fetch("/api/snapshot?range=" + range)');
  expect(js).toContain("export function formatPath");
  expect(js).toContain("export function isStale");
  expect(js).toContain("export function fillOpacity");
});

test("us.svg path ids are the 51 state codes", async () => {
  const svg = await Bun.file(new URL("../app/public/us.svg", import.meta.url)).text();
  const ids = [...svg.matchAll(/\bid="([A-Z]{2})"/g)].map((m) => m[1]);
  expect(ids).toHaveLength(51);
  expect(ids.sort()).toEqual([...STATE_CODES].sort());
  expect(svg.toLowerCase()).not.toContain("<circle");
});
