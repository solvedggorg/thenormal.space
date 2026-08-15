import { describe, expect, test } from "bun:test";
import { app } from "../src/index";
import { createTestEnv } from "./env";
import { SHOP_PRODUCTS } from "../../shared/shop";

const api = "https://api.thenormal.space";
const shopOrigin = "https://shop.thenormal.space";

describe("GET /shop/health", () => {
  test("reports when medusa is not configured", async () => {
    const { env } = createTestEnv();
    const res = await app.request(`${api}/shop/health`, {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, medusa: false });
  });
});

describe("GET /shop/products", () => {
  test("falls back to the static catalog", async () => {
    const { env } = createTestEnv();
    const res = await app.request(`${api}/shop/products`, { headers: { Origin: shopOrigin } }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(shopOrigin);
    expect(await res.json()).toEqual({ source: "catalog", products: SHOP_PRODUCTS });
  });

  test("returns a single catalog product", async () => {
    const { env } = createTestEnv();
    const res = await app.request(`${api}/shop/products/dishwasher`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; product: { handle: string } };
    expect(body.source).toBe("catalog");
    expect(body.product.handle).toBe("dishwasher");
  });
});

describe("GET /shop/media", () => {
  test("404 when the object is missing", async () => {
    const { env } = createTestEnv();
    const res = await app.request(`${api}/shop/media/missing.jpg`, {}, env);
    expect(res.status).toBe(404);
  });

  test("PUT without secret is 404", async () => {
    const { env } = createTestEnv({ SHOP_MEDIA_SECRET: "keep" });
    const res = await app.request(
      `${api}/shop/media/thing.jpg`,
      { method: "PUT", body: "img" },
      env,
    );
    expect(res.status).toBe(404);
  });

  test("PUT with secret stores the object", async () => {
    const { env } = createTestEnv({ SHOP_MEDIA_SECRET: "keep" });
    const res = await app.request(
      `${api}/shop/media/thing.jpg`,
      {
        method: "PUT",
        headers: { "x-media-secret": "keep", "content-type": "image/jpeg" },
        body: "img",
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string; url: string };
    expect(body.key).toBe("thing.jpg");
    expect(body.url).toBe("https://media.thenormal.space/thing.jpg");
  });
});

describe("POST /shop/webhooks/medusa", () => {
  test("unknown secret is 404", async () => {
    const { env } = createTestEnv({ SHOP_WEBHOOK_SECRET: "keep" });
    const res = await app.request(
      `${api}/shop/webhooks/medusa`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": "nope" },
        body: JSON.stringify({ type: "order.placed" }),
      },
      env,
    );
    expect(res.status).toBe(404);
  });

  test("valid secret writes and queues", async () => {
    const { env } = createTestEnv({ SHOP_WEBHOOK_SECRET: "keep" });
    const res = await app.request(
      `${api}/shop/webhooks/medusa`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": "keep" },
        body: JSON.stringify({ type: "order.placed" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const shopDb = env.SHOP_DB as unknown as { rows: Array<{ kind: string }> };
    const queue = env.SHOP_EVENTS as unknown as { sent: Array<{ kind: string }> };
    expect(shopDb.rows).toHaveLength(1);
    expect(shopDb.rows[0]?.kind).toBe("medusa");
    expect(queue.sent).toHaveLength(1);
  });
});
