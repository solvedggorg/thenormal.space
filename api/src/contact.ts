import { Hono } from "hono";
import { parseContact } from "./schemas";
import { logSecurity, MAX_JSON_BYTES, readLimitedText } from "./security";
import { verifyTurnstile } from "./turnstile";

type Bindings = Cloudflare.Env;

export const contact = new Hono<{ Bindings: Bindings }>();

contact.post("/contact", async (c) => {
  const raw = await readLimitedText(c.req.raw, MAX_JSON_BYTES);
  if (raw === null) return c.json({ error: "Send a JSON body." }, 400);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return c.json({ error: "Send a JSON body." }, 400);
  }
  const parsed = parseContact(json);
  if (!parsed.ok) {
    const status = parsed.error === "Could not verify this request." ? 403 : 400;
    return c.json({ error: parsed.error }, status);
  }

  const ok = await verifyTurnstile({
    secret: c.env.TURNSTILE_SECRET || "",
    token: parsed.value.turnstileToken,
    remoteip: c.req.header("CF-Connecting-IP") || "",
  });
  if (!ok) {
    logSecurity(c, "turnstile_failed");
    return c.json({ error: "Could not verify this request." }, 403);
  }

  if (parsed.value.website.trim()) return c.json({ ok: true });

  const from = c.env.CONTACT_FROM || "hello@thenormal.space";
  const to = c.env.CONTACT_TO || "hello@thenormal.space";
  const { name, email, topic, message } = parsed.value;
  const subject = `Contact · ${topic} · ${name}`;
  const text = [`Name: ${name}`, `Email: ${email}`, `Topic: ${topic}`, "", message].join("\n");
  const html = `<p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Topic:</strong> ${escapeHtml(topic)}</p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`;

  try {
    await c.env.EMAIL.send({
      from: { email: from, name: "The Normal Space" },
      to,
      replyTo: email,
      subject,
      text,
      html,
    });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error(JSON.stringify({ level: "error", mail: err.code || err.message || "send failed" }));
    return c.json({ error: "Could not send this note." }, 503);
  }

  return c.json({ ok: true });
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
