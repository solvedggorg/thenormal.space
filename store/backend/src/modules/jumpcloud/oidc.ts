import { createHash, randomBytes } from "crypto";
import { createRemoteJWKSet, importSPKI, jwtVerify, type JWTPayload } from "jose";

export const JUMPCLOUD_DEFAULT_ISSUER = "https://oauth.id.jumpcloud.com";
export const JUMPCLOUD_SCOPES = ["openid", "email", "profile"] as const;

export type JumpCloudOptions = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  issuer?: string;
  allowedEmailDomains?: string[];
  allowedCallbackUrls?: string[];
  requireVerifiedEmail?: boolean;
  jwtKey?: string;
};

export type JumpCloudOidcState = {
  callback_url: string;
  nonce: string;
  code_verifier: string;
};

export type JumpCloudProfile = {
  entityId: string;
  email: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email_verified?: boolean;
};

export function normalizeIssuer(issuer?: string): string {
  return (issuer || JUMPCLOUD_DEFAULT_ISSUER).replace(/\/+$/, "");
}

export function issuerCandidates(issuer: string): string[] {
  const base = normalizeIssuer(issuer);
  return [base, `${base}/`];
}

export function authorizationEndpoint(issuer: string): string {
  return `${normalizeIssuer(issuer)}/oauth2/auth`;
}

export function tokenEndpoint(issuer: string): string {
  return `${normalizeIssuer(issuer)}/oauth2/token`;
}

export function userinfoEndpoint(issuer: string): string {
  return `${normalizeIssuer(issuer)}/userinfo`;
}

export function jwksUrl(issuer: string): string {
  return `${normalizeIssuer(issuer)}/.well-known/jwks.json`;
}

export function randomOidcValue(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizationUrl(input: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  verifier: string;
  scopes?: string[];
}): string {
  const url = new URL(authorizationEndpoint(input.issuer));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", (input.scopes || [...JUMPCLOUD_SCOPES]).join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", pkceChallenge(input.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function callbackAllowed(
  callbackUrl: string,
  redirectUri: string,
  extra?: string[],
): boolean {
  return resolveRedirectUri(callbackUrl, redirectUri, extra) !== null;
}

/**
 * JumpCloud must see the registered redirect URI with no extra query.
 * The admin dashboard still sends ?auth_provider=jumpcloud — same path is ok.
 */
export function resolveRedirectUri(
  requested: string | undefined,
  redirectUri: string,
  extra?: string[],
): string | null {
  if (!requested) {
    return redirectUri;
  }
  const allowed = [redirectUri, ...(extra || [])];
  if (allowed.includes(requested)) {
    return redirectUri;
  }
  try {
    const requestUrl = new URL(requested);
    for (const candidate of allowed) {
      const allowedUrl = new URL(candidate);
      if (requestUrl.origin === allowedUrl.origin && requestUrl.pathname === allowedUrl.pathname) {
        return candidate;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function profileFromClaims(claims: JWTPayload): JumpCloudProfile {
  const entityId = typeof claims.sub === "string" ? claims.sub : "";
  const email = typeof claims.email === "string" ? claims.email : "";
  const given =
    typeof claims.given_name === "string" ? claims.given_name : undefined;
  const family =
    typeof claims.family_name === "string" ? claims.family_name : undefined;
  const name = typeof claims.name === "string" ? claims.name : undefined;
  const names = !given && !family && name ? splitName(name) : { first_name: given, last_name: family };
  return {
    entityId,
    email,
    first_name: names.first_name,
    last_name: names.last_name,
    name,
    email_verified: claims.email_verified === true,
  };
}

export function mergeProfiles(
  idToken: JumpCloudProfile,
  userinfo?: Partial<JumpCloudProfile>,
): JumpCloudProfile {
  return {
    entityId: idToken.entityId || userinfo?.entityId || "",
    email: idToken.email || userinfo?.email || "",
    first_name: idToken.first_name || userinfo?.first_name,
    last_name: idToken.last_name || userinfo?.last_name,
    name: idToken.name || userinfo?.name,
    email_verified: idToken.email_verified || userinfo?.email_verified,
  };
}

export function splitName(name: string): { first_name?: string; last_name?: string } {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return {};
  if (parts.length === 1) return { first_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

export function userMetadataFromProfile(profile: JumpCloudProfile): Record<string, unknown> {
  return {
    email: profile.email,
    first_name: profile.first_name,
    last_name: profile.last_name,
    name: profile.name,
  };
}

export async function verifyJumpCloudIdToken(
  idToken: string,
  options: {
    issuer: string;
    clientId: string;
    nonce: string;
    jwtKey?: string;
  },
): Promise<JWTPayload> {
  const verifyOptions = {
    issuer: issuerCandidates(options.issuer),
    audience: options.clientId,
    clockTolerance: 5,
  };
  const { payload } = options.jwtKey
    ? await jwtVerify(idToken, await importSPKI(options.jwtKey, "RS256"), verifyOptions)
    : await jwtVerify(idToken, createRemoteJWKSet(new URL(jwksUrl(options.issuer))), verifyOptions);
  if (payload.nonce && payload.nonce !== options.nonce) {
    throw new Error("JumpCloud nonce did not match");
  }
  return payload;
}
