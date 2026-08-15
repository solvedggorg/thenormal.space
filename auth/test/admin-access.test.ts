import { describe, expect, test } from "bun:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { app } from "../admin/src/index";
import { createTestEnv } from "./env";

const origin = "https://admin2.thenormal.space";

describe("admin Access", () => {
  test("missing token is 403", async () => {
    const { env } = await createTestEnv();
    const res = await app.request(`${origin}/`, {}, env);
    expect(res.status).toBe(403);
  });

  test("dev bypass is only when allowed", async () => {
    const { env } = await createTestEnv({ allowDevAccess: true });
    const res = await app.request(`${origin}/health`, {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, admin: "dev@thenormal.space" });
  });

  test("valid Access JWT is accepted", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "access-1";
    publicJwk.alg = "RS256";
    const token = await new SignJWT({ email: "you@thenormal.space" })
      .setProtectedHeader({ alg: "RS256", kid: "access-1" })
      .setIssuer("https://iresolved-llc.cloudflareaccess.com")
      .setAudience("test-aud")
      .setExpirationTime("1h")
      .sign(privateKey);
    const { env } = await createTestEnv({ accessJwks: JSON.stringify({ keys: [publicJwk] }), policyAud: "test-aud" });
    const res = await app.request(`${origin}/`, { headers: { "cf-access-jwt-assertion": token } }, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("you@thenormal.space");
    expect(html).toContain("People");
  });

  test("wrong audience is 403", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "access-1";
    const token = await new SignJWT({ email: "you@thenormal.space" })
      .setProtectedHeader({ alg: "RS256", kid: "access-1" })
      .setIssuer("https://iresolved-llc.cloudflareaccess.com")
      .setAudience("other")
      .setExpirationTime("1h")
      .sign(privateKey);
    const { env } = await createTestEnv({ accessJwks: JSON.stringify({ keys: [publicJwk] }), policyAud: "test-aud" });
    const res = await app.request(`${origin}/`, { headers: { "cf-access-jwt-assertion": token } }, env);
    expect(res.status).toBe(403);
  });

  test("JumpCloud is required after Access when configured", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "access-1";
    const token = await new SignJWT({ email: "you@thenormal.space" })
      .setProtectedHeader({ alg: "RS256", kid: "access-1" })
      .setIssuer("https://iresolved-llc.cloudflareaccess.com")
      .setAudience("test-aud")
      .setExpirationTime("1h")
      .sign(privateKey);
    const { env } = await createTestEnv({
      accessJwks: JSON.stringify({ keys: [publicJwk] }),
      policyAud: "test-aud",
      jumpcloud: true,
    });
    const res = await app.request(`${origin}/`, { headers: { "cf-access-jwt-assertion": token } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location") || "").toContain("/login");
  });

  test("missing Access is still 403 when JumpCloud is configured", async () => {
    const { env } = await createTestEnv({ jumpcloud: true });
    const res = await app.request(`${origin}/`, {}, env);
    expect(res.status).toBe(403);
  });

  test("JumpCloud start redirects to JumpCloud after Access", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "access-1";
    const token = await new SignJWT({ email: "you@thenormal.space" })
      .setProtectedHeader({ alg: "RS256", kid: "access-1" })
      .setIssuer("https://iresolved-llc.cloudflareaccess.com")
      .setAudience("test-aud")
      .setExpirationTime("1h")
      .sign(privateKey);
    const { env } = await createTestEnv({
      accessJwks: JSON.stringify({ keys: [publicJwk] }),
      policyAud: "test-aud",
      jumpcloud: true,
    });
    const res = await app.request(`${origin}/login/jumpcloud`, { headers: { "cf-access-jwt-assertion": token } }, env);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") || "";
    expect(loc.startsWith("https://oauth.id.jumpcloud.com/oauth2/auth")).toBe(true);
    expect(loc).toContain("client_id=jc-client");
    expect(loc).toContain("code_challenge_method=S256");
  });

  test("JumpCloud session is what the app uses", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "access-1";
    const token = await new SignJWT({ email: "access@thenormal.space" })
      .setProtectedHeader({ alg: "RS256", kid: "access-1" })
      .setIssuer("https://iresolved-llc.cloudflareaccess.com")
      .setAudience("test-aud")
      .setExpirationTime("1h")
      .sign(privateKey);
    const { env, kv } = await createTestEnv({
      accessJwks: JSON.stringify({ keys: [publicJwk] }),
      policyAud: "test-aud",
      jumpcloud: true,
      jumpcloudUser: "jc@thenormal.space",
    });
    const start = await app.request(`${origin}/login/jumpcloud`, { headers: { "cf-access-jwt-assertion": token } }, env);
    const loc = new URL(start.headers.get("location") || "");
    const state = loc.searchParams.get("state") || "";
    const cb = await app.request(
      `${origin}/oidc/callback?code=ok&state=${state}`,
      { headers: { "cf-access-jwt-assertion": token } },
      env,
    );
    expect(cb.status).toBe(302);
    const cookie = cb.headers.get("set-cookie") || "";
    expect(cookie).toContain("ns_jc=");
    const home = await app.request(
      `${origin}/`,
      { headers: { "cf-access-jwt-assertion": token, Cookie: cookie.split(";")[0] } },
      env,
    );
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain("jc@thenormal.space");
    expect(html).not.toContain("access@thenormal.space");
    expect(kv.data.size).toBeGreaterThan(0);
  });

  test("admin can create a client", async () => {
    const { env } = await createTestEnv({ allowDevAccess: true });
    const res = await app.request(
      `${origin}/clients`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          name: "Shop",
          type: "public",
          redirects: "https://shop.thenormal.space/cb",
          first_party: "on",
          offline: "on",
        }).toString(),
      },
      env,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Client ID");
    expect(html).toContain("Public client");
  });
});
