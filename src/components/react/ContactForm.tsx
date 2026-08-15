import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ContactTopic } from "../../data/site";
import { apiUrl, listIsLive } from "../../lib/api";
import { contactBody } from "../../lib/forms";

const LIST_DOWN = "The list is not live yet. Write hello@thenormal.space.";

type TurnstileAPI = {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => void;
};

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<ContactTopic>("things");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef("");

  useEffect(() => {
    if (!listIsLive()) return;
    if (!document.getElementById("cf-turnstile")) {
      const script = document.createElement("script");
      script.id = "cf-turnstile";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      document.head.appendChild(script);
    }
    const id = window.setInterval(() => {
      const turnstile = (window as unknown as { turnstile?: TurnstileAPI }).turnstile;
      const el = widgetRef.current;
      if (!turnstile || !el || el.dataset.rendered) return;
      el.dataset.rendered = "true";
      turnstile.render(el, {
        sitekey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
        callback: (token: string) => {
          tokenRef.current = token;
        },
      });
      window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!listIsLive()) {
      setError(LIST_DOWN);
      return;
    }
    if (!tokenRef.current) {
      setError("Could not verify this request.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          contactBody({
            name,
            email,
            topic,
            message,
            website,
            turnstileToken: tokenRef.current,
          }),
        ),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || LIST_DOWN);
      setDone(true);
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : LIST_DOWN;
      setError(text === "Could not send this note." ? text : LIST_DOWN);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="notice">
        We received it. We will write back to the address you gave.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="footer-honeypot" aria-hidden="true">
        <label>
          Website
          <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      </label>
      <label className="field">
        <span>Topic</span>
        <select value={topic} onChange={(event) => setTopic(event.target.value as ContactTopic)}>
          <option value="things">Things</option>
          <option value="watch">Watch</option>
          <option value="press">Press</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="field">
        <span>Message</span>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} required minLength={12} />
      </label>
      {listIsLive() ? <div ref={widgetRef} className="cf-turnstile" /> : null}
      {error ? <div className="notice">{error}</div> : null}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
