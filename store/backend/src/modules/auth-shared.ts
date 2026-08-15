import {
  AuthIdentityProviderService,
} from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";

export const GENERIC_AUTH_ERROR = "Authentication failed";

export function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function bearerToken(headers?: Record<string, string>): string {
  if (!headers) return "";
  const value = headers.authorization || headers.Authorization || "";
  const match = /^Bearer\s+(\S+)/i.exec(value);
  return match?.[1] || "";
}

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() || "";
}

export function assertAllowedEmail(
  email: string,
  allowedDomains: string[] | undefined,
): void {
  if (!allowedDomains?.length) return;
  const domain = emailDomain(email);
  const allowed = allowedDomains.map((item) => item.toLowerCase());
  if (!domain || !allowed.includes(domain)) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "The email domain is not allowed to authenticate with this provider",
    );
  }
}

export async function upsertAuthIdentity(
  authIdentityService: AuthIdentityProviderService,
  entityId: string,
  userMetadata: Record<string, unknown>,
) {
  try {
    await authIdentityService.retrieve({ entity_id: entityId });
    return await authIdentityService.update(entityId, {
      user_metadata: userMetadata,
    });
  } catch (error) {
    if (error?.type === MedusaError.Types.NOT_FOUND) {
      return await authIdentityService.create({
        entity_id: entityId,
        user_metadata: userMetadata,
      });
    }
    throw error;
  }
}
