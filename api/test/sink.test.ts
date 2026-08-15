import { describe, expect, test } from "bun:test";
import { app } from "../src/index";
import { consumeSink, objectKey } from "../src/sink/consume";
import { hashId } from "../src/sink/hash";
import { hintsFromRequest, normalizeEvent, parseEventType, shouldDropRequest } from "../src/sink/normalize";
import { hostAllowed } from "../src/sink/sites";
import { toDataPoint, type ArchivedEvent } from "../src/sink/schema";
import { firstMatchingPattern, matchPattern, trackerSource } from "../src/sink/tracker";
import { looksLikeBot, parseUserAgent } from "../src/sink/ua";
import { createTestEnv } from "./env";

const api = "https://api.thenormal.space";
const siteOrigin = "https://thenormal.space";

function sinkEnv(overrides: Record<string, unknown> = {}) {
  const { env } = createTestEnv(overrides);
  const written: unknown[] = [];
  const queued: unknown[] = [];
  (env as { SINK: { writeDataPoint: (p: unknown) => void; written: unknown[] } }).SINK = {
    written,
    writeDataPoint(point: unknown) {
      written.push(point);
    },
  };
  (env as { SINK_EVENTS: { send: (b: unknown) => Promise<void>; sent: unknown[] } }).SINK_EVENTS = {
    sent: queued,
    async send(body: unknown) {
      queued.push(body);
    },
  };
  return { env, written, queued };
}

describe("sink helpers", () => {
  test("parses Rybbit event type aliases", () => {
    expect(parseEventType("pageview")).toBe("pageview");
    expect(parseEventType("custom_event")).toBe("custom");
    expect(parseEventType("event")).toBe("custom");
    expect(parseEventType("outbound")).toBe("outbound");
    expect(parseEventType("nope")).toBeNull();
  });

  test("hashes visitor ids without keeping the raw value", async () => {
    const a = await hashId(["salt", "tns", "v", "abc"]);
    const b = await hashId(["salt", "tns", "v", "abc"]);
    const c = await hashId(["salt", "tns", "v", "xyz"]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(16);
    expect(a.includes("abc")).toBe(false);
  });

  test("classifies browsers and bots", () => {
    expect(parseUserAgent("Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36").browser).toBe("Chrome");
    expect(parseUserAgent("Mozilla/5.0 Macintosh Safari/605.1.15").os).toBe("macOS");
    expect(looksLikeBot("Mozilla/5.0 Googlebot/2.1")).toBe(true);
    expect(looksLikeBot("Mozilla/5.0 Chrome/120")).toBe(false);
  });

  test("matches skip and mask patterns", () => {
    expect(matchPattern("/admin/users", "/admin/*")).toBe(true);
    expect(matchPattern("/admin/users/list", "/admin/*")).toBe(false);
    expect(matchPattern("/admin/users/list", "/admin/**")).toBe(true);
    expect(firstMatchingPattern("/preview/x", ["/admin/**", "/preview/*"])).toBe("/preview/*");
    expect(matchPattern("/users/12", "re:^/users/\\d+$")).toBe(true);
  });

  test("normalizes a Rybbit-shaped pageview", async () => {
    const event = await normalizeEvent(
      {
        site_id: "tns",
        type: "pageview",
        url: "https://thenormal.space/dishwasher?utm_source=x",
        referrer: "https://google.com/search",
        language: "en-US",
        visitor_id: "vid",
        session_id: "sid",
      },
      {
        url: "https://api.thenormal.space/v1/sink/e",
        host: "api.thenormal.space",
        referer: "",
        userAgent: "Mozilla/5.0 Chrome/120",
        ip: "1.2.3.4",
        country: "US",
        region: "CA",
        city: "Los Angeles",
        deviceType: "desktop",
      },
      "salt",
    );
    expect(event?.host).toBe("thenormal.space");
    expect(event?.path).toBe("/dishwasher");
    expect(event?.referrer).toBe("google.com");
    expect(event?.utmSource).toBe("x");
    expect(event?.device).toBe("computer");
    expect(event?.visitor).toHaveLength(16);
    const point = toDataPoint(event!);
    expect(point.indexes[0]).toBe("tns");
    expect(point.blobs[0]).toBe("pageview");
    expect(point.blobs[2]).toBe("/dishwasher");
  });

  test("drops verified bots", () => {
    expect(
      shouldDropRequest({
        url: "",
        host: "",
        referer: "",
        userAgent: "Chrome",
        ip: "",
        verifiedBot: true,
      }),
    ).toBe(true);
  });

  test("allowlists first-party hosts and localhost in dev", () => {
    expect(hostAllowed("tns", "thenormal.space", false)).toBe(true);
    expect(hostAllowed("tns", "evil.example", false)).toBe(false);
    expect(hostAllowed("tns", "localhost:4321", true)).toBe(true);
    expect(hostAllowed("shop", "shop.thenormal.space", false)).toBe(true);
  });

  test("tracker script exposes rybbit and thenormal APIs", () => {
    const src = trackerSource();
    expect(src).toContain("data-site-id");
    expect(src).toContain("/v1/sink/e");
    expect(src).toContain("window.rybbit");
    expect(src).toContain("window.thenormal");
    expect(src).toContain("data-rybbit-event");
    expect(src).not.toContain("${");
  });
});

describe("POST /v1/sink/e", () => {
  test("accepts a first-party pageview", async () => {
    const { env, written, queued } = sinkEnv();
    const res = await app.request(
      `${api}/v1/sink/e`,
      {
        method: "POST",
        headers: {
          Origin: siteOrigin,
          "Content-Type": "text/plain",
          "User-Agent": "Mozilla/5.0 Chrome/120",
        },
        body: JSON.stringify({
          site_id: "tns",
          type: "pageview",
          url: "https://thenormal.space/dishwasher",
        }),
      },
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(siteOrigin);
    expect(written).toHaveLength(1);
    expect(queued).toHaveLength(1);
  });

  test("accepts a custom event with event_name", async () => {
    const { env, written } = sinkEnv();
    const res = await app.request(
      `${api}/v1/sink/track`,
      {
        method: "POST",
        headers: { Origin: siteOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: "tns",
          type: "custom_event",
          event_name: "notify",
          pathname: "/",
          hostname: "thenormal.space",
        }),
      },
      env,
    );
    expect(res.status).toBe(204);
    expect(written).toHaveLength(1);
  });

  test("drops events from a host the site does not own", async () => {
    const { env, written } = sinkEnv();
    const res = await app.request(
      `${api}/v1/sink/e`,
      {
        method: "POST",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: "tns",
          type: "pageview",
          url: "https://evil.example/",
        }),
      },
      env,
    );
    expect(res.status).toBe(204);
    expect(written).toHaveLength(0);
  });

  test("rejects unreadable JSON", async () => {
    const { env } = sinkEnv();
    const res = await app.request(
      `${api}/v1/sink/e`,
      {
        method: "POST",
        headers: { Origin: siteOrigin, "Content-Type": "application/json" },
        body: "{",
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/sink/t.js", () => {
  test("serves the tracker", async () => {
    const { env } = sinkEnv();
    const res = await app.request(`${api}/v1/sink/t.js`, {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    expect(await res.text()).toContain("window.rybbit");
  });

  test("aliases /v1/sink/script.js", async () => {
    const { env } = sinkEnv();
    const res = await app.request(`${api}/v1/sink/script.js`, {}, env);
    expect(res.status).toBe(200);
  });
});

describe("GET /v1/sink/e pixel", () => {
  test("records a noscript pageview", async () => {
    const { env, written } = sinkEnv();
    const res = await app.request(
      `${api}/v1/sink/e?site_id=tns&url=${encodeURIComponent("https://thenormal.space/")}`,
      { headers: { "User-Agent": "Mozilla/5.0 Chrome/120" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("image/gif");
    expect(written).toHaveLength(1);
  });
});

describe("POST /v1/sink/batch", () => {
  test("accepts several events", async () => {
    const { env, written } = sinkEnv();
    const res = await app.request(
      `${api}/v1/sink/batch`,
      {
        method: "POST",
        headers: { Origin: siteOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            { site_id: "tns", type: "pageview", url: "https://thenormal.space/" },
            { site_id: "tns", type: "custom_event", event_name: "click", url: "https://thenormal.space/" },
          ],
        }),
      },
      env,
    );
    expect(res.status).toBe(204);
    expect(written).toHaveLength(2);
  });
});

describe("sink archive", () => {
  test("writes jsonl keyed by site and hour", async () => {
    const when = new Date("2026-08-14T15:04:00.000Z");
    expect(objectKey("tns", when)).toBe("raw/site=tns/dt=2026-08-14/hour=15.jsonl");
    const store = new Map<string, string>();
    const env = {
      SINK_RAW: {
        async get(key: string) {
          const text = store.get(key);
          return text ? { text: async () => text } : null;
        },
        async put(key: string, value: string) {
          store.set(key, value);
        },
      },
    };
    const event: ArchivedEvent = {
      siteId: "tns",
      type: "pageview",
      host: "thenormal.space",
      path: "/",
      referrer: "(direct)",
      name: "",
      country: "US",
      region: "CA",
      city: "",
      device: "computer",
      browser: "Chrome",
      os: "macOS",
      visitor: "aaaa",
      session: "bbbb",
      utmSource: "",
      language: "en",
      utmMedium: "",
      utmCampaign: "",
      tag: "",
      count: 1,
      durationMs: 0,
      receivedAt: when.toISOString(),
    };
    await consumeSink(
      {
        queue: "thenormal-analytics-events",
        messages: [{ body: event, ack() {}, retry() {} }],
      } as unknown as MessageBatch<ArchivedEvent>,
      env,
    );
    const key = objectKey("tns", when);
    expect(store.get(key)).toContain('"siteId":"tns"');
  });
});

describe("hintsFromRequest", () => {
  test("reads Cloudflare headers", () => {
    const req = new Request("https://api.thenormal.space/v1/sink/e", {
      headers: {
        "cf-connecting-ip": "203.0.113.9",
        "cf-ipcountry": "US",
        "user-agent": "Chrome",
        referer: "https://thenormal.space/",
      },
    });
    const hints = hintsFromRequest(req);
    expect(hints.ip).toBe("203.0.113.9");
    expect(hints.country).toBe("US");
    expect(hints.referer).toContain("thenormal.space");
  });
});
