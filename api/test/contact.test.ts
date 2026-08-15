import { describe, expect, test } from "bun:test";
import { app } from "../src/index";
import { createTestEnv, stubTurnstile } from "./env";

const api = "https://api.thenormal.space";
const site = "https://thenormal.space";

const body = {
  name: "Ada",
  email: "ada@lab.org",
  topic: "things",
  message: "I want a dishwasher that is just a dishwasher.",
  website: "",
  turnstileToken: "ok",
};

async function post(payload: unknown, env = createTestEnv().env) {
  return app.request(
    `${api}/contact`,
    {
      method: "POST",
      headers: { Origin: site, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    env,
  );
}

describe("POST /contact", () => {
  test("OPTIONS is CORS, not a redirect", async () => {
    const { env } = createTestEnv();
    const res = await app.request(
      `${api}/contact`,
      {
        method: "OPTIONS",
        headers: {
          Origin: site,
          "Access-Control-Request-Method": "POST",
        },
      },
      env,
    );
    expect(res.status).not.toBe(302);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(site);
  });

  test("GET /contact is 404 JSON", async () => {
    const { env } = createTestEnv();
    const res = await app.request(`${api}/contact`, {}, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found." });
  });

  test("missing Turnstile is 403", async () => {
    const { env } = createTestEnv();
    const res = await post({ ...body, turnstileToken: "" }, env);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Could not verify this request." });
  });

  test("honeypot returns ok and does not send", async () => {
    const restore = stubTurnstile(true);
    const { env, mail } = createTestEnv();
    const res = await post({ ...body, website: "https://spam" }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(0);
    restore();
  });

  test("valid body sends to hello with reply-to visitor", async () => {
    const restore = stubTurnstile(true);
    const { env, mail } = createTestEnv();
    const res = await post(body, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe("hello@thenormal.space");
    expect(mail.sent[0]?.from?.email).toBe("hello@thenormal.space");
    expect(mail.sent[0]?.from?.name).toBe("The Normal Space");
    expect(mail.sent[0]?.replyTo).toBe("ada@lab.org");
    expect(mail.sent[0]?.subject).toBe("Contact · things · Ada");
    restore();
  });

  test("mail throw is 503 JSON", async () => {
    const restore = stubTurnstile(true);
    const { env } = createTestEnv({
      EMAIL: {
        async send() {
          throw new Error("boom");
        },
      },
    });
    const res = await post(body, env);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Could not send this note." });
    restore();
  });
});
