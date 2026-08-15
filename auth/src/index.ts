import { Hono } from "hono";
import type { AppEnv } from "./app-env";
import { loadSigningMaterial } from "./lib/jwt";
import { kvRateLimit, memoryRateLimit } from "./lib/rate-limit";
import { applySecurityHeaders, logJson } from "./lib/security";
import { oauth } from "./routes/oauth";
import { pages } from "./routes/pages";
import { createD1Store } from "./store/d1";
import { createMemoryStore } from "./store/memory";
import type { AuthStore } from "./store/types";

export const app = new Hono<AppEnv>();

app.onError((error, c) => {
  logJson("error", { message: error.message, path: new URL(c.req.url).pathname });
  return c.json({ error: "Something went wrong." }, 500);
});

app.use("*", async (c, next) => {
  applySecurityHeaders(c);
  const store = resolveStore(c.env);
  c.set("store", store);
  c.set("limit", c.env.KV ? kvRateLimit(c.env.KV) : memoryRateLimit());
  if (!c.env.AUTH_SIGNING_JWK) return c.json({ error: "Issuer key is not configured." }, 500);
  c.set("signing", await loadSigningMaterial(c.env.AUTH_SIGNING_JWK));
  await next();
});

app.route("/", pages);
app.route("/", oauth);

app.notFound((c) => {
  const accept = c.req.header("accept") || "";
  if (accept.includes("text/html")) return c.text("Not found.", 404);
  return c.json({ error: "Not found." }, 404);
});

export default {
  fetch: app.fetch,
} satisfies { fetch: typeof app.fetch };

const memoryStores = new WeakMap<object, AuthStore>();

function resolveStore(env: Cloudflare.Env & { TEST_STORE?: AuthStore }): AuthStore {
  if (env.TEST_STORE) return env.TEST_STORE;
  if (env.DB && typeof env.DB.prepare === "function") return createD1Store(env.DB);
  const existing = memoryStores.get(env);
  if (existing) return existing;
  const created = createMemoryStore();
  memoryStores.set(env, created);
  return created;
}
