import { describe, expect, test } from "bun:test";
import {
  actorIdFromMedusaToken,
  customerProfileFromMedusaToken,
  decodeJwtPayload,
  medusaTokenFromLogin,
} from "./customer-auth";

function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "none" })}.${encode(payload)}.`;
}

describe("customer-auth", () => {
  test("reads actor and profile claims from a Medusa token", () => {
    const token = unsignedJwt({
      actor_id: "cus_1",
      user_metadata: { email: "shopper@example.com", first_name: "Ada" },
    });
    expect(actorIdFromMedusaToken(token)).toBe("cus_1");
    expect(customerProfileFromMedusaToken(token)).toEqual({
      email: "shopper@example.com",
      first_name: "Ada",
      last_name: undefined,
    });
  });

  test("treats a missing actor as a first-time shopper", () => {
    const token = unsignedJwt({ actor_id: "", user_metadata: { email: "shopper@example.com" } });
    expect(actorIdFromMedusaToken(token)).toBe("");
    expect(decodeJwtPayload("not-a-jwt")).toEqual({});
  });

  test("accepts a string or wrapped login result", () => {
    expect(medusaTokenFromLogin("abc")).toBe("abc");
    expect(medusaTokenFromLogin({ token: "abc" })).toBe("abc");
    expect(medusaTokenFromLogin({ location: "/x" })).toBe("");
  });
});
