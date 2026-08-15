import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type AccessIdentity = {
  email: string;
  payload: JWTPayload;
};

export async function verifyAccess(input: {
  token: string | null | undefined;
  teamDomain: string;
  audience: string;
  jwksJson?: string;
}): Promise<AccessIdentity> {
  if (!input.token) throw new Error("missing");
  const jwks = input.jwksJson
    ? createLocalJWKSet(JSON.parse(input.jwksJson))
    : createRemoteJWKSet(new URL(`${input.teamDomain.replace(/\/$/, "")}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(input.token, jwks, {
    issuer: input.teamDomain.replace(/\/$/, ""),
    audience: input.audience,
  });
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!email) throw new Error("no-email");
  return { email, payload };
}

export function accessTokenFrom(request: Request): string | null {
  return request.headers.get("cf-access-jwt-assertion") || cookieValue(request, "CF_Authorization");
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
