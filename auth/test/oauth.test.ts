import { describe, expect, test } from "bun:test";
import { jwtVerify } from "jose";
import { app } from "../src/index";
import { sha256Bytes, toBase64Url } from "../src/lib/crypto";
import { createTestEnv, seedClient, seedUser } from "./env";

const origin = "https://auth.thenormal.space";

async function pkce() {
  const verifier = "a".repeat(64);
  const challenge = toBase64Url(await sha256Bytes(verifier));
  return { verifier, challenge };
}

describe("OAuth / OIDC", () => {
  test("authorize without a session sends the user to sign in", async () => {
    const { env, store } = await createTestEnv();
    await seedClient(store);
    const { challenge } = await pkce();
    const url = new URL(`${origin}/oauth/authorize`);
    url.searchParams.set("client_id", "shop");
    url.searchParams.set("redirect_uri", "https://shop.thenormal.space/cb");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", "xyz");
    const res = await app.request(url.toString(), {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location") || "").toContain("/?next=");
  });

  test("unknown redirect is rejected at the issuer", async () => {
    const { env, store } = await createTestEnv();
    await seedClient(store);
    const { challenge } = await pkce();
    const url = new URL(`${origin}/oauth/authorize`);
    url.searchParams.set("client_id", "shop");
    url.searchParams.set("redirect_uri", "https://evil.example/cb");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    const res = await app.request(url.toString(), {}, env);
    expect(res.status).toBe(400);
  });

  test("authorization code + PKCE + userinfo", async () => {
    const { env, store, material } = await createTestEnv();
    await seedUser(store);
    await seedClient(store);
    const { verifier, challenge } = await pkce();
    const url = new URL(`${origin}/oauth/authorize`);
    url.searchParams.set("client_id", "shop");
    url.searchParams.set("redirect_uri", "https://shop.thenormal.space/cb");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile email offline_access");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", "abc");
    url.searchParams.set("nonce", "n-1");
    const auth = await app.request(url.toString(), { headers: { Cookie: "ns_session=session-ada" } }, env);
    expect(auth.status).toBe(302);
    const loc = new URL(auth.headers.get("location") || "", "https://shop.thenormal.space");
    expect(loc.origin + loc.pathname).toBe("https://shop.thenormal.space/cb");
    expect(loc.searchParams.get("state")).toBe("abc");
    const code = loc.searchParams.get("code");
    expect(code).toBeTruthy();

    const tokenRes = await app.request(
      `${origin}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          redirect_uri: "https://shop.thenormal.space/cb",
          client_id: "shop",
          code_verifier: verifier,
        }).toString(),
      },
      env,
    );
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      id_token: string;
      refresh_token: string;
      token_type: string;
    };
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.refresh_token).toBeTruthy();
    const { payload } = await jwtVerify(tokens.id_token, await importPublic(material.publicJwk), {
      issuer: origin,
      audience: "shop",
    });
    expect(payload.email).toBe("ada@lab.org");
    expect(payload.nonce).toBe("n-1");

    const info = await app.request(
      `${origin}/oauth/userinfo`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      env,
    );
    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({ email: "ada@lab.org" });

    const reused = await app.request(
      `${origin}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          redirect_uri: "https://shop.thenormal.space/cb",
          client_id: "shop",
          code_verifier: verifier,
        }).toString(),
      },
      env,
    );
    expect(reused.status).toBe(400);
  });

  test("refresh rotates and replay is rejected", async () => {
    const { env, store } = await createTestEnv();
    await seedUser(store);
    await seedClient(store);
    const { verifier, challenge } = await pkce();
    const url = new URL(`${origin}/oauth/authorize`);
    url.searchParams.set("client_id", "shop");
    url.searchParams.set("redirect_uri", "https://shop.thenormal.space/cb");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid offline_access");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    const auth = await app.request(url.toString(), { headers: { Cookie: "ns_session=session-ada" } }, env);
    const code = new URL(auth.headers.get("location") || "").searchParams.get("code")!;
    const first = await app.request(
      `${origin}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://shop.thenormal.space/cb",
          client_id: "shop",
          code_verifier: verifier,
        }).toString(),
      },
      env,
    );
    const tokens = (await first.json()) as { refresh_token: string };
    const refresh = await app.request(
      `${origin}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: "shop",
        }).toString(),
      },
      env,
    );
    expect(refresh.status).toBe(200);
    const replay = await app.request(
      `${origin}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: "shop",
        }).toString(),
      },
      env,
    );
    expect(replay.status).toBe(400);
  });

  test("client credentials requires a confidential client", async () => {
    const { env, store } = await createTestEnv();
    const { secret } = await seedClient(store, "confidential");
    const res = await app.request(
      `${origin}/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`shop:${secret}`)}`,
        },
        body: new URLSearchParams({ grant_type: "client_credentials", scope: "email" }).toString(),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string };
    expect(body.access_token).toBeTruthy();
  });

  test("AAL1 session cannot finish authorize", async () => {
    const { env, store } = await createTestEnv();
    const user = await seedUser(store);
    await store.updateSession("session-ada", { aal: 1, amr: JSON.stringify(["email"]) });
    await seedClient(store);
    const { challenge } = await pkce();
    const url = new URL(`${origin}/oauth/authorize`);
    url.searchParams.set("client_id", "shop");
    url.searchParams.set("redirect_uri", "https://shop.thenormal.space/cb");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    const res = await app.request(url.toString(), { headers: { Cookie: "ns_session=session-ada" } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location") || "").toContain("/?next=");
    expect(user.email).toBe("ada@lab.org");
  });
});

async function importPublic(jwk: import("jose").JWK) {
  const { importJWK } = await import("jose");
  return importJWK(jwk, "EdDSA");
}
