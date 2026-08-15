import { escapeHtml } from "./security";

type Bindings = Cloudflare.Env;

export async function sendMail(
  env: Bindings,
  input: { to: string; subject: string; text: string; html: string },
): Promise<void> {
  const fromEmail = env.MAIL_FROM || "auth@thenormal.space";
  const fromName = env.MAIL_FROM_NAME || "The Normal Space";
  await env.EMAIL.send({
    to: input.to,
    from: { email: fromEmail, name: fromName },
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export function authLinkMail(kind: "verify" | "login", email: string, url: string) {
  const action = kind === "verify" ? "Confirm this address" : "Sign in";
  const lead =
    kind === "verify"
      ? "Use this link to confirm the address and continue."
      : "Use this link to sign in. It works once.";
  return {
    to: email,
    subject: kind === "verify" ? "Confirm your address" : "Your sign-in link",
    text: [lead, "", url, "", "If you did not ask for this, ignore the mail."].join("\n"),
    html: `<p>${escapeHtml(lead)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(action)}</a></p><p>If you did not ask for this, ignore the mail.</p>`,
  };
}

export function inviteMail(email: string, url: string) {
  return {
    to: email,
    subject: "You were invited",
    text: ["An account is ready for this address.", "", url, "", "If you did not expect this, ignore the mail."].join("\n"),
    html: `<p>An account is ready for this address.</p><p><a href="${escapeHtml(url)}">Continue</a></p><p>If you did not expect this, ignore the mail.</p>`,
  };
}
