import { expect, test } from "bun:test";
import {
  RULE_OUTSIDE_US,
  RULE_VPN_TOR,
  aeSql,
  bucketFirewall,
  firewallQuery,
  normalizeBucketTime,
  parseAeTable,
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
  expect(parsed.series[0]?.t).toBe("2026-08-14T10:00:00.000Z");
  expect(parsed.series[1]?.t).toBe("2026-08-14T11:00:00.000Z");
});

test("parseAeTable accepts data and result wrappers", () => {
  expect(
    parseAeTable({ data: [{ host: "thenormal.space", views: "4" }] }, ["host", "views"]),
  ).toEqual([{ host: "thenormal.space", views: 4 }]);
  expect(
    parseAeTable({ result: [{ data: [{ path: "/", views: 2 }] }] }, ["path", "views"]),
  ).toEqual([{ path: "/", views: 2 }]);
  expect(
    parseAeTable({ result: { data: [{ path: "/x", views: 1 }] } }, ["path", "views"]),
  ).toEqual([{ path: "/x", views: 1 }]);
});

test("firewallQuery selects blocked rule groups", () => {
  const q = firewallQuery("2026-08-07T12:00:00Z", "2026-08-14T12:00:00Z");
  expect(q).toContain("firewallEventsAdaptiveGroups");
  expect(q).toContain('action: "block"');
  expect(q).toContain("count_DESC");
  expect(q).toContain("ruleId");
  expect(q).toContain("source");
});

test("30d visits use date buckets and parseVisits coerces midnight UTC", () => {
  const q = visitsQuery("30d", "2026-07-15T12:00:00.000Z", "2026-08-14T12:00:00.000Z");
  expect(q).toContain("date_geq");
  expect(q).toContain("date_leq");
  expect(q).toContain("date_ASC");
  expect(q).not.toContain("datetimeHour");
  expect(q).not.toContain("uniq");
  const parsed = parseVisits({
    data: {
      viewer: {
        zones: [
          {
            httpRequestsAdaptiveGroups: [
              { sum: { visits: 3 }, dimensions: { date: "2026-08-14" } },
            ],
          },
        ],
      },
    },
  });
  expect(parsed.series).toEqual([{ t: "2026-08-14T00:00:00.000Z", visitors: 3 }]);
});

test("series t from GraphQL hour and AE DateTime join", () => {
  expect(normalizeBucketTime("2026-08-14T10:00:00Z")).toBe("2026-08-14T10:00:00.000Z");
  expect(normalizeBucketTime("2026-08-14T10:00:00.000Z")).toBe("2026-08-14T10:00:00.000Z");
  expect(normalizeBucketTime("2026-08-14 10:00:00")).toBe("2026-08-14T10:00:00.000Z");
  expect(normalizeBucketTime("2026-08-14")).toBe("2026-08-14T00:00:00.000Z");
  const gql = parseVisits({
    data: {
      viewer: {
        zones: [
          {
            httpRequestsAdaptiveGroups: [
              { sum: { visits: 5 }, dimensions: { datetimeHour: "2026-08-14T10:00:00Z" } },
            ],
          },
        ],
      },
    },
  });
  const ae = parseAeTable(
    { data: [{ t: "2026-08-14 10:00:00", pageviews: 9 }] },
    ["t", "pageviews"],
  );
  expect(gql.series[0]?.t).toBe("2026-08-14T10:00:00.000Z");
  expect(ae[0]?.t).toBe(gql.series[0]?.t);
});
