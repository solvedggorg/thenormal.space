import { expect, test } from "bun:test";
import { aeSql, bounceRate, emptyOverview, parseAeTable, parseRange } from "../src/query";
import { snippetFor } from "../src/sites";

test("range defaults to 7d", () => {
  expect(parseRange("24h")).toBe("24h");
  expect(parseRange("nope")).toBe("7d");
});

test("SQL is pinned to a safe site id", () => {
  const sql = aeSql("thenormal_sink", "tns", "7d");
  expect(sql.totals).toContain("index1 = 'tns'");
  expect(sql.totals).toContain("thenormal_sink");
  expect(sql.pages).toContain("blob3 AS path");
  expect(sql.events).toContain("blob1 = 'custom'");
  expect(() => aeSql("thenormal_sink", "tns'; DROP", "7d")).toThrow(/site/);
});

test("bounce is single-page sessions over all sessions", () => {
  expect(bounceRate([])).toBeNull();
  expect(bounceRate([{ views: 1 }, { views: 1 }, { views: 4 }])).toBeCloseTo(2 / 3);
});

test("parses AE table rows", () => {
  const rows = parseAeTable({ data: [{ path: "/", views: 12 }, { path: "/x", views: "3" }] }, ["path", "views"]);
  expect(rows).toEqual([
    { path: "/", views: 12 },
    { path: "/x", views: "3" },
  ]);
});

test("empty overview is marked unavailable", () => {
  const snap = emptyOverview("7d", "2026-08-14T00:00:00.000Z");
  expect(snap.unavailable).toBe(true);
  expect(snap.visitors).toBe(0);
});

test("snippet points at the first-party sink", () => {
  expect(snippetFor("https://api.thenormal.space", "tns")).toBe(
    `<script src="https://api.thenormal.space/v1/sink/script.js" defer data-site-id="tns"></script>`,
  );
});
