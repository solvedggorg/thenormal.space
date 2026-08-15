import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { fromBase64Url, toBase64Url } from "./lib/crypto";
import type { Passkey } from "./store/types";

export function rpFromIssuer(issuer: string): { rpID: string; origin: string } {
  const url = new URL(issuer);
  return { rpID: url.hostname, origin: url.origin };
}

export async function registrationOptions(input: {
  rpName: string;
  rpID: string;
  userId: string;
  email: string;
  existing: Passkey[];
}) {
  return generateRegistrationOptions({
    rpName: input.rpName,
    rpID: input.rpID,
    userName: input.email,
    userDisplayName: input.email,
    userID: new Uint8Array(new TextEncoder().encode(input.userId)),
    attestationType: "none",
    excludeCredentials: input.existing.map((key) => ({
      id: key.credential_id,
      transports: parseTransports(key.transports),
    })),
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
  });
}

export async function authenticationOptions(input: { rpID: string; allow?: Passkey[] }) {
  return generateAuthenticationOptions({
    rpID: input.rpID,
    userVerification: "required",
    allowCredentials: input.allow?.map((key) => ({
      id: key.credential_id,
      transports: parseTransports(key.transports),
    })),
  });
}

export async function verifyRegistration(input: {
  response: RegistrationResponseJSON;
  challenge: string;
  origin: string;
  rpID: string;
}) {
  return verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: input.origin,
    expectedRPID: input.rpID,
    requireUserVerification: true,
  });
}

export async function verifyAuthentication(input: {
  response: AuthenticationResponseJSON;
  challenge: string;
  origin: string;
  rpID: string;
  passkey: Passkey;
}) {
  return verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: input.origin,
    expectedRPID: input.rpID,
    requireUserVerification: true,
    credential: {
      id: input.passkey.credential_id,
      publicKey: Uint8Array.from(fromBase64Url(input.passkey.public_key)),
      counter: input.passkey.counter,
      transports: parseTransports(input.passkey.transports),
    },
  });
}

export function encodePublicKey(bytes: Uint8Array): string {
  return toBase64Url(bytes);
}

function parseTransports(raw: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as AuthenticatorTransportFuture[]) : undefined;
  } catch {
    return undefined;
  }
}
