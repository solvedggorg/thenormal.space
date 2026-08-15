import { describe, expect, test } from "bun:test";
import { app } from "../src/index";
import { createTestEnv, stubTurnstile } from "./env";

const api = "https://api.thenormal.space";
const site = "https://thenormal.space";

async function subscribe(body: Record<string, unknown>, env: Cloudflare.Env) {
  return app.request(
    `${api}/list/subscribe`,
    {
      method: "POST",
      headers: { Origin: site, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("POST /list/subscribe", () => {
  test("honeypot returns ok and does not write or mail", async () => {
    const restore = stubTurnstile(true);
    const { env, db, mail } = createTestEnv();
    const res = await subscribe(
      { email: "a@b.c", website: "https://spam", turnstileToken: "ok", interest: "dishwasher" },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.rows).toHaveLength(0);
    expect(db.interestRows).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
    restore();
  });

  test("new email with dishwasher is pending and sends confirm mail", async () => {
    const restore = stubTurnstile(true);
    const { env, db, mail } = createTestEnv();
    const res = await subscribe(
      { email: "ada@lab.org", website: "", turnstileToken: "ok", interest: "dishwasher" },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.email).toBe("ada@lab.org");
    expect(db.rows[0]?.status).toBe("pending");
    expect(db.interestRows).toEqual([{ subscriber_id: db.rows[0]!.id, interest: "dishwasher" }]);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe("ada@lab.org");
    expect(mail.sent[0]?.subject).toBe("Confirm you want notes from The Normal Space.");
    expect(mail.sent[0]?.from?.name).toBe("The Normal Space");
    restore();
  });

  test("pending email with a new interest stays pending and resends confirm", async () => {
    const restore = stubTurnstile(true);
    const { env, db, mail } = createTestEnv();
    db.rows.push({
      id: "1",
      email: "ada@lab.org",
      status: "pending",
      confirm_token: "keep-me",
      unsub_token: "u",
    });
    db.interestRows.push({ subscriber_id: "1", interest: "dishwasher" });
    const res = await subscribe(
      { email: "ada@lab.org", website: "", turnstileToken: "ok", interest: "films" },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.rows[0]?.status).toBe("pending");
    expect(db.rows[0]?.confirm_token).toBe("keep-me");
    expect(db.interestRows.map((row) => row.interest).sort()).toEqual(["dishwasher", "films"]);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.subject).toBe("Confirm you want notes from The Normal Space.");
    restore();
  });

  test("confirmed email with a new interest attaches it and sends list-too note", async () => {
    const restore = stubTurnstile(true);
    const { env, db, mail } = createTestEnv();
    db.rows.push({
      id: "2",
      email: "ada@lab.org",
      status: "confirmed",
      confirm_token: null,
      unsub_token: "u2",
    });
    db.interestRows.push({ subscriber_id: "2", interest: "dishwasher" });
    const res = await subscribe(
      { email: "ada@lab.org", website: "", turnstileToken: "ok", interest: "films" },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.rows[0]?.status).toBe("confirmed");
    expect(db.interestRows.map((row) => row.interest).sort()).toEqual(["dishwasher", "films"]);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.subject).toBe("You are on this list too.");
    restore();
  });

  test("confirmed email with the same interest sends no mail", async () => {
    const restore = stubTurnstile(true);
    const { env, db, mail } = createTestEnv();
    db.rows.push({
      id: "2",
      email: "ada@lab.org",
      status: "confirmed",
      confirm_token: null,
      unsub_token: "u2",
    });
    db.interestRows.push({ subscriber_id: "2", interest: "dishwasher" });
    const res = await subscribe(
      { email: "ada@lab.org", website: "", turnstileToken: "ok", interest: "dishwasher" },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.interestRows).toHaveLength(1);
    expect(mail.sent).toHaveLength(0);
    restore();
  });

  test("unsubscribed email becomes pending with a new confirm token", async () => {
    const restore = stubTurnstile(true);
    const { env, db, mail } = createTestEnv();
    db.rows.push({
      id: "3",
      email: "ada@lab.org",
      status: "unsubscribed",
      confirm_token: "old",
      unsub_token: "u3",
    });
    const res = await subscribe(
      { email: "ada@lab.org", website: "", turnstileToken: "ok", interest: "dishwasher" },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.rows[0]?.status).toBe("pending");
    expect(db.rows[0]?.confirm_token).toBeTruthy();
    expect(db.rows[0]?.confirm_token).not.toBe("old");
    expect(db.interestRows).toEqual([{ subscriber_id: "3", interest: "dishwasher" }]);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.subject).toBe("Confirm you want notes from The Normal Space.");
    restore();
  });
});

describe("GET /list/confirm", () => {
  test("missing token redirects to notify=missing", async () => {
    const { env } = createTestEnv();
    const res = await app.request(`${api}/list/confirm`, {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`${site}/?notify=missing`);
  });

  test("matching pending token confirms and sends welcome", async () => {
    const { env, db, mail } = createTestEnv();
    db.rows.push({
      id: "4",
      email: "ada@lab.org",
      status: "pending",
      confirm_token: "confirm-me",
      unsub_token: "u4",
    });
    const res = await app.request(`${api}/list/confirm?token=confirm-me`, {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`${site}/?notify=confirmed`);
    expect(db.rows[0]?.status).toBe("confirmed");
    expect(db.rows[0]?.confirm_token).toBeNull();
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.subject).toBe("You are on the list.");
  });
});

describe("GET /list/unsubscribe", () => {
  test("missing token redirects to notify=missing", async () => {
    const { env } = createTestEnv();
    const res = await app.request(`${api}/list/unsubscribe`, {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`${site}/?notify=missing`);
  });
});
