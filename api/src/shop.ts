import { Hono } from "hono";
import { SHOP_PRODUCTS, shopProductByHandle, type ShopProduct } from "../../shared/shop";
import { allowedOrigin } from "./cors";
import { formCors, logSecurity, readLimitedText } from "./security";

type Bindings = Cloudflare.Env;

export const shop = new Hono<{ Bindings: Bindings }>();

const CATALOG_KEY = "catalog:v1";
const CATALOG_TTL = 60;
const WEBHOOK_MAX_BYTES = 65_536;

type CatalogPayload = {
  source: "medusa" | "catalog";
  products: ShopProduct[];
};

shop.use("/shop/products", async (c, next) => {
  const allowDev = c.env.ALLOW_DEV_ORIGINS === "true";
  const origin = c.req.header("Origin") || "";
  if (origin && !allowedOrigin(origin, allowDev)) logSecurity(c, "origin_denied");
  return formCors(allowDev)(c, next);
});

shop.use("/shop/webhooks/medusa", async (c, next) => {
  const allowDev = c.env.ALLOW_DEV_ORIGINS === "true";
  return formCors(allowDev)(c, next);
});

shop.get("/shop/health", (c) => {
  return c.json({
    ok: true,
    medusa: Boolean(c.env.MEDUSA_BACKEND_URL && c.env.MEDUSA_PUBLISHABLE_KEY),
  });
});

shop.get("/shop/products", async (c) => {
  const cached = await c.env.SHOP_CACHE.get<CatalogPayload>(CATALOG_KEY, "json");
  if (cached) return c.json(cached);

  const fromMedusa = await loadMedusaProducts(c.env);
  const payload: CatalogPayload = fromMedusa
    ? { source: "medusa", products: fromMedusa }
    : { source: "catalog", products: SHOP_PRODUCTS };

  await c.env.SHOP_CACHE.put(CATALOG_KEY, JSON.stringify(payload), { expirationTtl: CATALOG_TTL });
  return c.json(payload);
});

shop.get("/shop/products/:handle", async (c) => {
  const handle = c.req.param("handle");
  const list = await loadMedusaProducts(c.env);
  const product = list?.find((item) => item.handle === handle) ?? shopProductByHandle(handle);
  if (!product) return c.json({ error: "Not found." }, 404);
  return c.json({
    source: list ? "medusa" : "catalog",
    product,
  });
});

shop.get("/shop/media/*", async (c) => {
  const key = mediaKey(c.req.path);
  if (!key) return c.json({ error: "Not found." }, 404);
  const object = await c.env.MEDIA.get(key);
  if (!object) return c.json({ error: "Not found." }, 404);

  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  const type = object.httpMetadata?.contentType;
  if (type) headers.set("Content-Type", type);
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
});

shop.put("/shop/media/*", async (c) => {
  if (!mediaAuthorized(c.env.SHOP_MEDIA_SECRET || "", c.req.header("x-media-secret") || "")) {
    return c.json({ error: "Not found." }, 404);
  }
  const key = mediaKey(c.req.path);
  if (!key) return c.json({ error: "Not found." }, 404);
  const type = c.req.header("content-type") || "application/octet-stream";
  await c.env.MEDIA.put(key, c.req.raw.body, { httpMetadata: { contentType: type } });
  return c.json({ ok: true, key, url: `https://media.thenormal.space/${key}` }, 201);
});

shop.delete("/shop/media/*", async (c) => {
  if (!mediaAuthorized(c.env.SHOP_MEDIA_SECRET || "", c.req.header("x-media-secret") || "")) {
    return c.json({ error: "Not found." }, 404);
  }
  const key = mediaKey(c.req.path);
  if (!key) return c.json({ error: "Not found." }, 404);
  await c.env.MEDIA.delete(key);
  return c.json({ ok: true });
});

shop.post("/shop/webhooks/medusa", async (c) => {
  const expected = c.env.SHOP_WEBHOOK_SECRET || "";
  const given = c.req.header("x-webhook-secret") || "";
  if (!expected || !safeEqual(expected, given)) {
    return c.json({ error: "Not found." }, 404);
  }

  const raw = await readLimitedText(c.req.raw, WEBHOOK_MAX_BYTES);
  if (raw === null) return c.json({ error: "Send a JSON body." }, 400);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.json({ error: "Send a JSON body." }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await c.env.SHOP_DB.prepare(
    "INSERT INTO shop_events (id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(id, "medusa", JSON.stringify(payload), createdAt)
    .run();

  await c.env.SHOP_EVENTS.send({ id, kind: "medusa", createdAt });
  return c.json({ ok: true });
});

async function loadMedusaProducts(env: Cloudflare.Env): Promise<ShopProduct[] | null> {
  const base = (env.MEDUSA_BACKEND_URL || "").replace(/\/$/, "");
  const key = env.MEDUSA_PUBLISHABLE_KEY || "";
  if (!base || !key) return null;

  try {
    const response = await fetch(`${base}/store/products?limit=50`, {
      headers: { "x-publishable-api-key": key },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      products?: Array<{
        handle?: string;
        title?: string;
        subtitle?: string;
        description?: string;
      }>;
    };
    const products = (body.products ?? [])
      .map((item) => {
        const handle = (item.handle || "").trim();
        if (!handle) return null;
        const name = (item.title || handle).trim();
        const sentence = (item.subtitle || item.description || name).trim();
        return {
          handle,
          name,
          sentence,
          paragraph: sentence,
          href: `/product/${handle}`,
        } satisfies ShopProduct;
      })
      .filter((item): item is ShopProduct => item !== null);
    return products.length ? products : null;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: error instanceof Error ? error.message : "medusa catalog failed",
      }),
    );
    return null;
  }
}

function mediaKey(path: string): string {
  const key = decodeURIComponent(path.replace(/^\/shop\/media\//, ""));
  if (!key || key.includes("..") || key.startsWith("/")) return "";
  return key;
}

function mediaAuthorized(expected: string, given: string): boolean {
  return Boolean(expected) && safeEqual(expected, given);
}

function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
