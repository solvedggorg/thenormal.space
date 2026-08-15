import { Hono, type Context } from "hono";
import type { AppEnv } from "../app-env";
import { clerkConfigured, clerkFrontendApi } from "../clerk";
import { layout } from "../lib/html";
import { escapeHtml } from "../lib/security";
import { safeNext } from "../oauth";
import { clearSessionCookie, readSession } from "../session";

export const pages = new Hono<AppEnv>();

pages.get("/health", (c) => c.json({ ok: true, idp: "clerk" }));

pages.get("/", (c) => clerkPage(c, "sign-in"));
pages.get("/register", (c) => clerkPage(c, "sign-up"));
pages.get("/sign-up", (c) => c.redirect(`/register?${new URL(c.req.url).searchParams}`, 302));

pages.get("/account", async (c) => {
  const session = await readSession(c);
  if (!session) return c.redirect("/", 302);
  return clerkPage(c, "user", session.user.email);
});

pages.get("/consent", async (c) => {
  const session = await readSession(c);
  if (!session) return c.redirect(`/?next=${encodeURIComponent(c.req.url.replace(new URL(c.req.url).origin, ""))}`, 302);
  const client = await c.get("store").getClientByClientId(c.req.query("client_id") || "");
  if (!client) return c.text("Unknown client.", 400);
  const scopes = (c.req.query("scope") || "openid").split(/\s+/);
  const fields = new URL(c.req.url).searchParams;
  const hidden = [...fields.entries()]
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
    .join("");
  return c.html(
    layout({
      title: "Allow access",
      kicker: client.name,
      body: `
        <h1>${escapeHtml(client.name)} wants access</h1>
        <p>This lets it see ${escapeHtml(scopes.join(", "))} for ${escapeHtml(session.user.email)}.</p>
        <form class="card" method="post" action="/oauth/authorize">
          ${hidden}
          <div class="row">
            <button class="primary" name="decision" value="allow" type="submit">Allow</button>
            <button class="ghost" name="decision" value="deny" type="submit">Deny</button>
          </div>
        </form>
      `,
    }),
  );
});

pages.get("/mfa", (c) => c.redirect(`/?next=${encodeURIComponent(safeNext(c.req.query("next")))}`, 302));
pages.get("/verify", (c) => c.redirect("/", 302));
pages.get("/login/email", (c) => c.redirect("/", 302));
pages.get("/passkey/enroll", (c) => c.redirect("/account", 302));
pages.get("/check-email", (c) => c.redirect("/", 302));

pages.post("/sign-out", (c) => {
  clearSessionCookie(c);
  return c.redirect("/", 302);
});

async function clerkPage(c: Context<AppEnv>, mode: "sign-in" | "sign-up" | "user", email?: string) {
  const next = safeNext(c.req.query("next"));
  if (!clerkConfigured(c.env) && !c.env.TEST_CLERK_USER) {
    return c.html(
      layout({
        title: mode === "sign-up" ? "Create an account" : "Sign in",
        kicker: "Clerk",
        body: `<h1>Sign in</h1><p>Clerk is the identity provider. Set <span class="mono">CLERK_PUBLISHABLE_KEY</span> to turn this page on.</p>`,
      }),
    );
  }
  if (c.env.TEST_CLERK_USER && mode !== "user") {
    return c.html(
      layout({
        title: "Sign in",
        kicker: "Clerk",
        body: `<h1>Signed in with Clerk</h1><p class="muted">${escapeHtml(c.env.TEST_CLERK_USER)}</p>`,
      }),
    );
  }
  const pk = c.env.CLERK_PUBLISHABLE_KEY || "";
  const frontend = clerkFrontendApi(c.env);
  const scriptSrc = frontend
    ? `https://${frontend}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`
    : "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
  const titles = { "sign-in": "Sign in", "sign-up": "Create an account", user: "Account" };
  return c.html(
    layout({
      title: titles[mode],
      kicker: mode === "user" ? email || "Clerk" : "Clerk",
      extraHead: `<script>window.__clerk_pk = ${JSON.stringify(pk)}; window.__clerk_next = ${JSON.stringify(next)}; window.__clerk_mode = ${JSON.stringify(mode)};</script>`,
      body: `
        <h1>${titles[mode]}</h1>
        <p>${mode === "user" ? "Your account lives in Clerk. This app keeps a local record for orders and the rest of the products." : "Sign in with Clerk. Passkeys and codes are handled there."}</p>
        <div class="card" id="clerk"></div>
        ${mode === "user" ? `<form method="post" action="/sign-out" style="margin-top:1rem"><button class="ghost" type="submit">Sign out</button></form>` : `<p class="muted">${mode === "sign-in" ? `<a href="/register?next=${encodeURIComponent(next)}">Create an account</a>` : `<a href="/?next=${encodeURIComponent(next)}">Sign in</a>`}</p>`}
        <script src="${scriptSrc}" data-clerk-publishable-key="${escapeHtml(pk)}" async crossorigin="anonymous"></script>
        <script>
          (function boot(){
            function go(){
              var Clerk = window.Clerk;
              if (!Clerk) { setTimeout(go, 40); return; }
              Clerk.load({ publishableKey: window.__clerk_pk }).then(function(){
                var el = document.getElementById("clerk");
                var next = window.__clerk_next || "/account";
                var appearance = { variables: { colorBackground: "#111110", colorText: "#f2f0ea", colorPrimary: "#f2f0ea", colorInputBackground: "#070707", colorInputText: "#f2f0ea", borderRadius: "12px" } };
                if (window.__clerk_mode === "user") {
                  if (!Clerk.user) { location.href = "/?next=" + encodeURIComponent("/account"); return; }
                  Clerk.mountUserProfile(el, { appearance: appearance, routing: "hash" });
                  return;
                }
                if (Clerk.user) { location.href = next; return; }
                var opts = { appearance: appearance, routing: "hash", forceRedirectUrl: next, signInUrl: "/?next=" + encodeURIComponent(next), signUpUrl: "/register?next=" + encodeURIComponent(next) };
                if (window.__clerk_mode === "sign-up") Clerk.mountSignUp(el, opts);
                else Clerk.mountSignIn(el, opts);
              });
            }
            go();
          })();
        </script>
      `,
    }),
  );
}


