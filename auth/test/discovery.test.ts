import { describe, expect, test } from "bun:test";
import { app } from "../src/index";
import { createTestEnv } from "./env";

const origin = "https://auth.thenormal.space";

describe("OIDC discovery", () => {
  test("openid-configuration lists code + S256 + EdDSA", async () => {
    const { env } = await createTestEnv();
    const res = await app.request(`${origin}/.well-known/openid-configuration`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      issuer: string;
      code_challenge_methods_supported: string[];
      response_types_supported: string[];
      id_token_signing_alg_values_supported: string[];
    };
    expect(body.issuer).toBe(origin);
    expect(body.response_types_supported).toEqual(["code"]);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.id_token_signing_alg_values_supported).toEqual(["EdDSA"]);
  });

  test("jwks has the signing key", async () => {
    const { env, material } = await createTestEnv();
    const res = await app.request(`${origin}/oauth/jwks`, {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: { kid: string; kty: string }[] };
    expect(body.keys[0]?.kid).toBe(material.kid);
    expect(body.keys[0]?.kty).toBe("OKP");
  });

  test("health is public", async () => {
    const { env } = await createTestEnv();
    const res = await app.request(`${origin}/health`, {}, env);
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean; idp: string }).toEqual({ ok: true, idp: "clerk" });
  });
});
