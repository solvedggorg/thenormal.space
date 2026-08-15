import { Hono } from "hono";
import { contact } from "./contact";
import { allowedOrigin } from "./cors";
import { list } from "./list";
import { applySecurityHeaders, denyNotFound, formCors, logSecurity } from "./security";
import { shop } from "./shop";

type Bindings = Cloudflare.Env;

export const app = new Hono<{ Bindings: Bindings }>();

app.onError((error, c) => {
  console.error(JSON.stringify({ level: "error", message: error.message }));
  return c.json({ error: "Something went wrong." }, 500);
});

app.use("*", async (c, next) => {
  applySecurityHeaders(c);
  await next();
});

app.use("/list/subscribe", async (c, next) => {
  const allowDev = c.env.ALLOW_DEV_ORIGINS === "true";
  const origin = c.req.header("Origin") || "";
  if (origin && !allowedOrigin(origin, allowDev)) logSecurity(c, "origin_denied");
  return formCors(allowDev)(c, next);
});

app.use("/contact", async (c, next) => {
  const allowDev = c.env.ALLOW_DEV_ORIGINS === "true";
  const origin = c.req.header("Origin") || "";
  if (origin && !allowedOrigin(origin, allowDev)) logSecurity(c, "origin_denied");
  return formCors(allowDev)(c, next);
});

app.route("/list", list);
app.route("/", contact);
app.route("/", shop);

app.notFound((c) => denyNotFound(c));

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<{ id: string; kind: string; createdAt: string }>) {
    for (const message of batch.messages) {
      console.log(JSON.stringify({ level: "info", queue: "thenormal-shop-events", body: message.body }));
      message.ack();
    }
  },
};
