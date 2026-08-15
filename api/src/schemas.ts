import {
  CONTACT_TOPICS,
  INTERESTS,
  type ContactTopic,
  type Interest,
} from "../../shared/catalog";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SubscribeInput = {
  email: string;
  website: string;
  turnstileToken: string;
  interest: Interest;
};

export function parseSubscribe(
  body: unknown,
): { ok: true; value: SubscribeInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON body." };
  const raw = body as {
    email?: unknown;
    website?: unknown;
    turnstileToken?: unknown;
    interest?: unknown;
  };
  const turnstileToken = typeof raw.turnstileToken === "string" ? raw.turnstileToken.trim() : "";
  if (!turnstileToken) return { ok: false, error: "Could not verify this request." };
  const website = typeof raw.website === "string" ? raw.website : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter an email we can write back to." };
  }
  const interest = raw.interest;
  if (typeof interest !== "string" || !(INTERESTS as readonly string[]).includes(interest)) {
    return { ok: false, error: "Choose what you want a note about." };
  }
  return { ok: true, value: { email, website, turnstileToken, interest: interest as Interest } };
}

export type ContactInput = {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  website: string;
  turnstileToken: string;
};

export function parseContact(
  body: unknown,
): { ok: true; value: ContactInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON body." };
  const raw = body as Record<string, unknown>;
  const turnstileToken = typeof raw.turnstileToken === "string" ? raw.turnstileToken.trim() : "";
  if (!turnstileToken) return { ok: false, error: "Could not verify this request." };
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length < 2 || name.length > 120) return { ok: false, error: "Enter a name." };
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter an email we can write back to." };
  }
  const topic = raw.topic;
  if (typeof topic !== "string" || !(CONTACT_TOPICS as readonly string[]).includes(topic)) {
    return { ok: false, error: "Choose a topic." };
  }
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (message.length < 12) return { ok: false, error: "Write a little more." };
  if (message.length > 5000) return { ok: false, error: "Shorten this note." };
  const website = typeof raw.website === "string" ? raw.website : "";
  return {
    ok: true,
    value: { name, email, topic: topic as ContactTopic, message, website, turnstileToken },
  };
}
