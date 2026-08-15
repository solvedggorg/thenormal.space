import { AuthenticationInput } from "@medusajs/framework/types";
import { createRemoteJWKSet, importSPKI, jwtVerify, type JWTPayload } from "jose";
import { bearerToken } from "../auth-shared";

export type ClerkOptions = {
  secretKey?: string;
  publishableKey?: string;
  issuer?: string;
  jwtKey?: string;
  authorizedParties?: string[];
  apiUrl?: string;
};

export type ClerkProfile = {
  entityId: string;
  email: string;
  first_name?: string;
  last_name?: string;
  name?: string;
};

export function frontendApiFromPublishableKey(key: string): string | null {
  const stripped = key.replace(/^pk_(test|live)_/, "");
  if (stripped === key || !stripped) return null;
  const padded = stripped.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (stripped.length % 4)) % 4);
  try {
    const decoded = Buffer.from(padded, "base64").toString("utf8").replace(/\$$/, "");
    return decoded || null;
  } catch {
    return null;
  }
}

export function clerkIssuer(options: ClerkOptions): string {
  if (options.issuer) return options.issuer.replace(/\/+$/, "");
  if (options.publishableKey) {
    const frontendApi = frontendApiFromPublishableKey(options.publishableKey);
    if (frontendApi) return `https://${frontendApi}`;
  }
  return "";
}

export function clerkJwksUrl(issuer: string): string {
  return `${issuer.replace(/\/+$/, "")}/.well-known/jwks.json`;
}

export function tokenFromInput(data: AuthenticationInput): string {
  const body = data.body ?? {};
  const query = data.query ?? {};
  return body.token || body.session_token || query.token || bearerToken(data.headers);
}

export function assertAuthorizedParty(
  azp: unknown,
  authorizedParties?: string[],
): void {
  if (!authorizedParties?.length) return;
  if (typeof azp !== "string" || !azp) return;
  if (!authorizedParties.includes(azp)) {
    throw new Error("Clerk authorized party is not allowed");
  }
}

export function profileFromClerkClaims(claims: JWTPayload): ClerkProfile {
  const entityId = typeof claims.sub === "string" ? claims.sub : "";
  const email =
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.primary_email_address === "string" && claims.primary_email_address) ||
    "";
  const first =
    typeof claims.first_name === "string" ? claims.first_name : undefined;
  const last = typeof claims.last_name === "string" ? claims.last_name : undefined;
  const name = typeof claims.name === "string" ? claims.name : [first, last].filter(Boolean).join(" ") || undefined;
  return { entityId, email, first_name: first, last_name: last, name };
}

export function profileFromClerkUser(user: Record<string, unknown>): Partial<ClerkProfile> {
  const emails = Array.isArray(user.email_addresses) ? user.email_addresses : [];
  const primaryId = typeof user.primary_email_address_id === "string" ? user.primary_email_address_id : "";
  const primary = emails.find((item) => {
    return Boolean(item && typeof item === "object" && (item as { id?: string }).id === primaryId);
  }) as { email_address?: string } | undefined;
  const firstListed = emails[0] as { email_address?: string } | undefined;
  const email = primary?.email_address || firstListed?.email_address || "";
  const first_name = typeof user.first_name === "string" ? user.first_name : undefined;
  const last_name = typeof user.last_name === "string" ? user.last_name : undefined;
  const name = [first_name, last_name].filter(Boolean).join(" ") || undefined;
  return {
    entityId: typeof user.id === "string" ? user.id : undefined,
    email,
    first_name,
    last_name,
    name,
  };
}

export function userMetadataFromClerk(profile: ClerkProfile): Record<string, unknown> {
  return {
    email: profile.email,
    first_name: profile.first_name,
    last_name: profile.last_name,
    name: profile.name,
    clerk_user_id: profile.entityId,
  };
}

export async function verifyClerkSessionToken(
  token: string,
  options: ClerkOptions,
): Promise<JWTPayload> {
  const issuer = clerkIssuer(options);
  if (!issuer && !options.jwtKey) {
    throw new Error("Clerk issuer or jwtKey is required");
  }
  const verifyOptions = {
    ...(issuer ? { issuer: [issuer, `${issuer}/`] } : {}),
    clockTolerance: 5,
  };
  const { payload } = options.jwtKey
    ? await jwtVerify(token, await importSPKI(options.jwtKey, "RS256"), verifyOptions)
    : await jwtVerify(token, createRemoteJWKSet(new URL(clerkJwksUrl(issuer))), verifyOptions);
  assertAuthorizedParty(payload.azp, options.authorizedParties);
  return payload;
}

export async function fetchClerkUser(
  userId: string,
  options: ClerkOptions,
): Promise<Record<string, unknown> | null> {
  if (!options.secretKey) return null;
  const apiUrl = (options.apiUrl || "https://api.clerk.com").replace(/\/+$/, "");
  const response = await fetch(`${apiUrl}/v1/users/${encodeURIComponent(userId)}`, {
    headers: {
      Authorization: `Bearer ${options.secretKey}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Clerk user lookup failed (${response.status})`);
  }
  return (await response.json()) as Record<string, unknown>;
}
