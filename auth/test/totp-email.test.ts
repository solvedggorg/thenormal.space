import { describe, expect, test } from "bun:test";
import { app } from "../src/index";
import { generateTotpSecret, totpAt, verifyTotp } from "../src/lib/totp";
import { createTestEnv } from "./env";

const origin = "https://auth.thenormal.space";

describe("login surface", () => {
  test("totp helper still works", async () => {
    const secret = generateTotpSecret();
    const code = await totpAt(secret, 1_700_000_000_000);
    expect(code).toMatch(/^\d{6}$/);
    expect(await verifyTotp(secret, code, 1_700_000_000_000)).toBe(true);
    expect(await verifyTotp(secret, "000000", 1_700_000_000_000)).toBe(false);
  });

  test("sign-in says Clerk is the IdP", async () => {
    const { env } = await createTestEnv();
    const res = await app.request(`${origin}/`, {}, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Clerk");
    expect(html).toContain("identity provider");
  });

  test("register is Clerk too", async () => {
    const { env } = await createTestEnv();
    const res = await app.request(`${origin}/register`, {}, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Clerk");
  });

  test("old email and passkey routes send people to Clerk", async () => {
    const { env } = await createTestEnv();
    const mfa = await app.request(`${origin}/mfa`, {}, env);
    expect(mfa.status).toBe(302);
    expect(mfa.headers.get("location") || "").toContain("/");
    const verify = await app.request(`${origin}/verify`, {}, env);
    expect(verify.status).toBe(302);
  });
});
