import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { MedusaError } from "@medusajs/framework/utils";
import {
  assertAuthorizedParty,
  clerkIssuer,
  frontendApiFromPublishableKey,
  profileFromClerkClaims,
  profileFromClerkUser,
  tokenFromInput,
  verifyClerkSessionToken,
} from "../session";
import ClerkAuthService from "../service";

function fakeAuthService() {
  const identities = new Map<string, Record<string, unknown>>();
  return {
    retrieve: async ({ entity_id }: { entity_id: string }) => {
      const found = identities.get(entity_id);
      if (!found) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "missing");
      }
      return found;
    },
    create: async (data: { entity_id: string; user_metadata?: Record<string, unknown> }) => {
      const created = { id: `auth_${data.entity_id}`, ...data };
      identities.set(data.entity_id, created);
      return created;
    },
    update: async (entity_id: string, data: { user_metadata?: Record<string, unknown> }) => {
      const next = { ...identities.get(entity_id), ...data };
      identities.set(entity_id, next);
      return next;
    },
    setState: async () => undefined,
    getState: async () => null,
    store: identities,
  };
}

describe("clerk session helpers", () => {
  test("derives the Clerk issuer from a publishable key", () => {
    const encoded = Buffer.from("clerk.thenormal.space$").toString("base64");
    const key = `pk_live_${encoded}`;
    expect(frontendApiFromPublishableKey(key)).toBe("clerk.thenormal.space");
    expect(clerkIssuer({ publishableKey: key })).toBe("https://clerk.thenormal.space");
  });

  test("reads the session token from the body or Authorization header", () => {
    expect(tokenFromInput({ body: { token: "abc" } })).toBe("abc");
    expect(tokenFromInput({ headers: { authorization: "Bearer xyz" } })).toBe("xyz");
  });

  test("allows a missing azp and rejects a foreign one", () => {
    expect(() => assertAuthorizedParty(undefined, ["https://shop.thenormal.space"])).not.toThrow();
    expect(() =>
      assertAuthorizedParty("https://evil.example", ["https://shop.thenormal.space"]),
    ).toThrow(/authorized party/);
  });

  test("maps Clerk users and claims", () => {
    expect(
      profileFromClerkClaims({
        sub: "user_1",
        email: "shopper@example.com",
        first_name: "Ada",
      }).email,
    ).toBe("shopper@example.com");
    expect(
      profileFromClerkUser({
        id: "user_1",
        primary_email_address_id: "idn_2",
        first_name: "Ada",
        last_name: "Lovelace",
        email_addresses: [
          { id: "idn_1", email_address: "other@example.com" },
          { id: "idn_2", email_address: "shopper@example.com" },
        ],
      }).email,
    ).toBe("shopper@example.com");
  });

  test("authenticates a verified Clerk session and creates an identity", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwtKey = await exportSPKI(publicKey);
    const token = await new SignJWT({
      sub: "user_abc",
      email: "shopper@example.com",
      azp: "https://shop.thenormal.space",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://clerk.thenormal.space")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const payload = await verifyClerkSessionToken(token, {
      issuer: "https://clerk.thenormal.space",
      jwtKey,
      authorizedParties: ["https://shop.thenormal.space"],
    });
    expect(payload.sub).toBe("user_abc");

    const auth = fakeAuthService();
    const service = new ClerkAuthService(
      { logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as never },
      {
        issuer: "https://clerk.thenormal.space",
        jwtKey,
        authorizedParties: ["https://shop.thenormal.space"],
      },
    );
    const result = await service.authenticate({ body: { token } }, auth as never);
    expect(result.success).toBe(true);
    expect(result.authIdentity?.id).toBe("auth_user_abc");
    expect(auth.store.get("user_abc")?.user_metadata).toMatchObject({
      email: "shopper@example.com",
      clerk_user_id: "user_abc",
    });
  });
});
