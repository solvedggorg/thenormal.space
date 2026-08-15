import { medusa, medusaPublishableKey } from "./medusa";

export const CLERK_PROVIDER = "clerk";

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) return {};
  const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
  try {
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function actorIdFromMedusaToken(token: string): string {
  const actor = decodeJwtPayload(token).actor_id;
  return typeof actor === "string" ? actor : "";
}

export function customerProfileFromMedusaToken(token: string): {
  email: string;
  first_name?: string;
  last_name?: string;
} {
  const meta = decodeJwtPayload(token).user_metadata;
  const fields = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  return {
    email: typeof fields.email === "string" ? fields.email : "",
    first_name: typeof fields.first_name === "string" ? fields.first_name : undefined,
    last_name: typeof fields.last_name === "string" ? fields.last_name : undefined,
  };
}

export function medusaTokenFromLogin(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "token" in result) {
    const token = (result as { token?: unknown }).token;
    if (typeof token === "string") return token;
  }
  return "";
}

export async function syncMedusaCustomer(clerkSessionToken: string): Promise<{ created: boolean }> {
  if (!medusa || !medusaPublishableKey) {
    throw new Error("The shop backend is not configured.");
  }
  const token = medusaTokenFromLogin(
    await medusa.auth.login("customer", CLERK_PROVIDER, { token: clerkSessionToken }),
  );
  if (!token) {
    throw new Error("Clerk sign-in did not return a shop session.");
  }
  if (actorIdFromMedusaToken(token)) {
    return { created: false };
  }
  const profile = customerProfileFromMedusaToken(token);
  if (!profile.email) {
    throw new Error("This Clerk account has no email.");
  }
  await medusa.store.customer.create({
    email: profile.email,
    first_name: profile.first_name,
    last_name: profile.last_name,
  });
  await medusa.auth.refresh();
  return { created: true };
}

export async function clearMedusaSession(): Promise<void> {
  if (!medusa) return;
  await medusa.auth.logout();
}
