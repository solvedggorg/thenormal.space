import type { OAuthClient } from "./store/types";

export const SUPPORTED_SCOPES = ["openid", "profile", "email", "offline_access"] as const;
export const DEFAULT_SCOPES = ["openid", "profile", "email"];

export function parseList(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  } catch {
    return raw.split(/[,\s]+/).filter(Boolean);
  }
  return [];
}

export function parseScopes(raw: string | undefined): string[] {
  const requested = (raw || "").split(/\s+/).filter(Boolean);
  if (!requested.length) return [...DEFAULT_SCOPES];
  const allowed = new Set<string>(SUPPORTED_SCOPES);
  const next = requested.filter((scope) => allowed.has(scope));
  if (!next.includes("openid") && requested.includes("openid")) return [];
  if (requested.includes("openid") && !next.includes("openid")) return [];
  return next.includes("openid") ? next : ["openid", ...next];
}

export function scopeAllowed(client: OAuthClient, scopes: string[]): boolean {
  const allowed = new Set(parseList(client.scopes));
  return scopes.every((scope) => allowed.has(scope));
}

export function consentCovers(granted: string, requested: string[]): boolean {
  const have = new Set(granted.split(/\s+/).filter(Boolean));
  return requested.every((scope) => have.has(scope));
}

export function redirectAllowed(client: OAuthClient, redirectUri: string): boolean {
  return parseList(client.redirect_uris).includes(redirectUri);
}

export function grantAllowed(client: OAuthClient, grant: string): boolean {
  return parseList(client.grant_types).includes(grant);
}

export function issuerOf(env: Cloudflare.Env, url: string): string {
  return (env.ISSUER || new URL(url).origin).replace(/\/$/, "");
}

export function discovery(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    introspection_endpoint: `${issuer}/oauth/introspect`,
    jwks_uri: `${issuer}/oauth/jwks`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query", "form_post"],
    grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["EdDSA"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    scopes_supported: [...SUPPORTED_SCOPES],
    claims_supported: ["sub", "iss", "aud", "exp", "iat", "email", "email_verified", "name", "amr", "auth_time", "nonce"],
    code_challenge_methods_supported: ["S256"],
    request_uri_parameter_supported: false,
    request_parameter_supported: false,
  };
}

export function oauthErrorRedirect(redirectUri: string, error: string, description: string, state?: string | null) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function oauthCodeRedirect(redirectUri: string, code: string, state?: string | null) {
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function parseBasicAuth(header: string | undefined): { id: string; secret: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return { id: decodeURIComponent(decoded.slice(0, idx)), secret: decodeURIComponent(decoded.slice(idx + 1)) };
  } catch {
    return null;
  }
}

export function safeNext(value: string | undefined | null, fallback = "/account"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
