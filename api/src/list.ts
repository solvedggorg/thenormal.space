import { Hono } from "hono";
import { parseSubscribe } from "./schemas";
import { logSecurity, MAX_JSON_BYTES, readLimitedText } from "./security";
import { verifyTurnstile } from "./turnstile";

type Bindings = Cloudflare.Env;

export const list = new Hono<{ Bindings: Bindings }>();

list.post("/subscribe", async (c) => {
  const raw = await readLimitedText(c.req.raw, MAX_JSON_BYTES);
  if (raw === null) return c.json({ error: "Send a JSON body." }, 400);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return c.json({ error: "Send a JSON body." }, 400);
  }
  const parsed = parseSubscribe(json);
  if (!parsed.ok) {
    const status = parsed.error === "Could not verify this request." ? 403 : 400;
    return c.json({ error: parsed.error }, status);
  }

  const turnstileSecret = c.env.TURNSTILE_SECRET || "";
  const verified = await verifyTurnstile({
    secret: turnstileSecret,
    token: parsed.value.turnstileToken,
    remoteip: c.req.header("CF-Connecting-IP") || "",
  });
  if (!verified) {
    logSecurity(c, "turnstile_failed");
    return c.json({ error: "Could not verify this request." }, 403);
  }

  if (parsed.value.website.trim()) return c.json({ ok: true });

  const { email, interest } = parsed.value;
  const now = new Date().toISOString();
  const existing = await c.env.DB.prepare(
    "SELECT id, status, confirm_token, unsub_token FROM subscribers WHERE email = ?",
  )
    .bind(email)
    .first<{ id: string; status: string; confirm_token: string | null; unsub_token: string }>();

  const currentInterests = existing
    ? await c.env.DB.prepare("SELECT interest FROM subscriber_interests WHERE subscriber_id = ?")
        .bind(existing.id)
        .all<{ interest: string }>()
    : { results: [] };

  const hasInterest = currentInterests.results.some((row) => row.interest === interest);

  if (existing?.status === "confirmed") {
    if (!hasInterest) {
      await c.env.DB.prepare("INSERT INTO subscriber_interests (subscriber_id, interest) VALUES (?, ?)")
        .bind(existing.id, interest)
        .run();
      const origin = new URL(c.req.url).origin;
      const unsubUrl = `${origin}/list/unsubscribe?token=${existing.unsub_token}`;
      await sendMail(c.env, {
        to: email,
        subject: "You are on this list too.",
        text: ["You are on this list too.", "", `Unsubscribe: ${unsubUrl}`].join("\n"),
        html: `<p>You are on this list too.</p><p><a href="${unsubUrl}">Unsubscribe</a></p>`,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
    }
    return c.json({ ok: true });
  }

  if (existing?.status === "pending") {
    if (!hasInterest) {
      await c.env.DB.prepare("INSERT INTO subscriber_interests (subscriber_id, interest) VALUES (?, ?)")
        .bind(existing.id, interest)
        .run();
    }
    const confirmToken = existing.confirm_token || token();
    await sendConfirmMail(c.env, c.req.url, email, confirmToken);
    return c.json({ ok: true });
  }

  if (existing?.status === "unsubscribed") {
    const confirmToken = token();
    const unsubToken = existing.unsub_token || token();
    await c.env.DB.prepare(
      "UPDATE subscribers SET status = 'pending', confirm_token = ?, unsub_token = ?, unsubscribed_at = NULL WHERE id = ?",
    )
      .bind(confirmToken, unsubToken, existing.id)
      .run();
    if (!hasInterest) {
      await c.env.DB.prepare("INSERT INTO subscriber_interests (subscriber_id, interest) VALUES (?, ?)")
        .bind(existing.id, interest)
        .run();
    }
    await sendConfirmMail(c.env, c.req.url, email, confirmToken);
    return c.json({ ok: true });
  }

  const id = crypto.randomUUID();
  const confirmToken = token();
  const unsubToken = token();
  await c.env.DB.prepare(
    "INSERT INTO subscribers (id, email, status, confirm_token, unsub_token, created_at) VALUES (?, ?, 'pending', ?, ?, ?)",
  )
    .bind(id, email, confirmToken, unsubToken, now)
    .run();
  await c.env.DB.prepare("INSERT INTO subscriber_interests (subscriber_id, interest) VALUES (?, ?)")
    .bind(id, interest)
    .run();
  await sendConfirmMail(c.env, c.req.url, email, confirmToken);

  return c.json({ ok: true });
});

list.get("/confirm", async (c) => {
  const siteUrl = c.env.SITE_URL?.replace(/\/$/, "") || "https://thenormal.space";
  const confirmToken = c.req.query("token")?.trim();
  if (!confirmToken) {
    return c.redirect(`${siteUrl}/?notify=missing`, 302);
  }

  const row = await c.env.DB.prepare(
    "SELECT id, email, status, unsub_token FROM subscribers WHERE confirm_token = ?",
  )
    .bind(confirmToken)
    .first<{ id: string; email: string; status: string; unsub_token: string }>();

  if (!row) {
    return c.redirect(`${siteUrl}/?notify=missing`, 302);
  }

  if (row.status !== "confirmed") {
    await c.env.DB.prepare(
      "UPDATE subscribers SET status = 'confirmed', confirm_token = NULL, confirmed_at = ? WHERE id = ?",
    )
      .bind(new Date().toISOString(), row.id)
      .run();

    const origin = new URL(c.req.url).origin;
    const unsubUrl = `${origin}/list/unsubscribe?token=${row.unsub_token}`;
    await sendMail(c.env, {
      to: row.email,
      subject: "You are on the list.",
      text: ["You are on the list.", "", `Unsubscribe: ${unsubUrl}`].join("\n"),
      html: `<p>You are on the list.</p><p><a href="${unsubUrl}">Unsubscribe</a></p>`,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  }

  return c.redirect(`${siteUrl}/?notify=confirmed`, 302);
});

list.get("/unsubscribe", async (c) => {
  const siteUrl = c.env.SITE_URL?.replace(/\/$/, "") || "https://thenormal.space";
  const unsubToken = c.req.query("token")?.trim();
  if (!unsubToken) {
    return c.redirect(`${siteUrl}/?notify=missing`, 302);
  }

  await c.env.DB.prepare(
    "UPDATE subscribers SET status = 'unsubscribed', confirm_token = NULL, unsubscribed_at = ? WHERE unsub_token = ?",
  )
    .bind(new Date().toISOString(), unsubToken)
    .run();

  return c.redirect(`${siteUrl}/?notify=unsubscribed`, 302);
});

list.post("/unsubscribe", async (c) => {
  const unsubToken = c.req.query("token")?.trim();
  if (unsubToken) {
    await c.env.DB.prepare(
      "UPDATE subscribers SET status = 'unsubscribed', confirm_token = NULL, unsubscribed_at = ? WHERE unsub_token = ?",
    )
      .bind(new Date().toISOString(), unsubToken)
      .run();
  }
  return c.text("Unsubscribed.", 200);
});

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

async function sendConfirmMail(env: Bindings, requestUrl: string, email: string, confirmToken: string) {
  const origin = new URL(requestUrl).origin;
  const confirmUrl = `${origin}/list/confirm?token=${confirmToken}`;
  await sendMail(env, {
    to: email,
    subject: "Confirm you want notes from The Normal Space.",
    text: [
      "Confirm this address to receive notes from The Normal Space.",
      "",
      confirmUrl,
      "",
      "If you did not ask for this, ignore the note.",
    ].join("\n"),
    html: `<p>Confirm this address to receive notes from The Normal Space.</p><p><a href="${confirmUrl}">Confirm subscription</a></p><p>If you did not ask for this, ignore the note.</p>`,
  });
}

async function sendMail(
  env: Bindings,
  message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    headers?: Record<string, string>;
  },
) {
  const from = env.MAIL_FROM || "hello@thenormal.space";
  try {
    await env.EMAIL.send({
      from: { email: from, name: "The Normal Space" },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.headers,
    });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error(JSON.stringify({ level: "error", mail: err.code || err.message || "send failed" }));
  }
}
