import { generateKeyPair, exportSPKI, SignJWT } from "jose";
import { MedusaError } from "@medusajs/framework/utils";
import { assertAllowedEmail } from "../../auth-shared";
import {
  buildAuthorizationUrl,
  callbackAllowed,
  resolveRedirectUri,
  mergeProfiles,
  normalizeIssuer,
  pkceChallenge,
  profileFromClaims,
  userMetadataFromProfile,
  verifyJumpCloudIdToken,
} from "../oidc";

describe("jumpcloud oidc helpers", () => {
  test("normalizes issuer and builds a PKCE authorize URL", () => {
    const url = new URL(
      buildAuthorizationUrl({
        issuer: "https://oauth.id.jumpcloud.com/",
        clientId: "jc-app",
        redirectUri: "https://admin1.thenormal.space/app/login",
        state: "state-1",
        nonce: "nonce-1",
        verifier: "verifier-1",
      }),
    );
    expect(normalizeIssuer("https://oauth.id.jumpcloud.com/")).toBe(
      "https://oauth.id.jumpcloud.com",
    );
    expect(url.origin + url.pathname).toBe("https://oauth.id.jumpcloud.com/oauth2/auth");
    expect(url.searchParams.get("client_id")).toBe("jc-app");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge("verifier-1"));
    expect(url.searchParams.get("scope")).toContain("openid");
  });

  test("allows only configured callback URLs", () => {
    expect(
      callbackAllowed(
        "https://admin1.thenormal.space/app/login",
        "https://admin1.thenormal.space/app/login",
      ),
    ).toBe(true);
    expect(
      callbackAllowed("https://evil.example/cb", "https://admin1.thenormal.space/app/login"),
    ).toBe(false);
  });

  test("strips the admin SSO query so JumpCloud sees the registered redirect", () => {
    expect(
      resolveRedirectUri(
        "https://admin1.thenormal.space/app/login?auth_provider=jumpcloud",
        "https://admin1.thenormal.space/app/login",
      ),
    ).toBe("https://admin1.thenormal.space/app/login");
    expect(
      resolveRedirectUri(undefined, "https://admin1.thenormal.space/app/login"),
    ).toBe("https://admin1.thenormal.space/app/login");
    expect(
      resolveRedirectUri(
        "https://evil.example/app/login?auth_provider=jumpcloud",
        "https://admin1.thenormal.space/app/login",
      ),
    ).toBeNull();
  });

  test("maps claims and rejects a disallowed email domain", () => {
    const profile = profileFromClaims({
      sub: "jc-user-1",
      email: "ops@thenormal.space",
      given_name: "Ada",
      family_name: "Lovelace",
    });
    expect(profile.entityId).toBe("jc-user-1");
    expect(userMetadataFromProfile(profile).email).toBe("ops@thenormal.space");
    expect(() => assertAllowedEmail(profile.email, ["thenormal.space"])).not.toThrow();
    expect(() => assertAllowedEmail(profile.email, ["other.example"])).toThrow(MedusaError);
  });

  test("merges userinfo when the ID token omitted email", () => {
    const merged = mergeProfiles(
      { entityId: "jc-user-1", email: "" },
      { email: "ops@thenormal.space", first_name: "Ada" },
    );
    expect(merged.email).toBe("ops@thenormal.space");
    expect(merged.first_name).toBe("Ada");
  });

  test("verifies a JumpCloud ID token and nonce", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwtKey = await exportSPKI(publicKey);
    const token = await new SignJWT({
      sub: "jc-user-1",
      email: "ops@thenormal.space",
      nonce: "abc",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://oauth.id.jumpcloud.com/")
      .setAudience("jc-app")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const payload = await verifyJumpCloudIdToken(token, {
      issuer: "https://oauth.id.jumpcloud.com",
      clientId: "jc-app",
      nonce: "abc",
      jwtKey,
    });
    expect(payload.sub).toBe("jc-user-1");

    await expect(
      verifyJumpCloudIdToken(token, {
        issuer: "https://oauth.id.jumpcloud.com",
        clientId: "jc-app",
        nonce: "wrong",
        jwtKey,
      }),
    ).rejects.toThrow(/nonce/);
  });
});
