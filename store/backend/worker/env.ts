export const SECRET_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "COOKIE_SECRET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "SHOP_MEDIA_SECRET",
  "JUMPCLOUD_CLIENT_ID",
  "JUMPCLOUD_CLIENT_SECRET",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_KEY",
  "STRIPE_API_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PRINTFUL_API_TOKEN",
  "PRINTFUL_WEBHOOK_SECRET",
] as const;

export const VAR_KEYS = [
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
  "MEDUSA_BACKEND_URL",
  "MEDUSA_WORKER_MODE",
  "DISABLE_MEDUSA_ADMIN",
  "S3_FILE_URL",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "SHOP_API_URL",
  "JUMPCLOUD_ISSUER",
  "JUMPCLOUD_REDIRECT_URI",
  "JUMPCLOUD_ALLOWED_EMAIL_DOMAINS",
  "JUMPCLOUD_ALLOWED_CALLBACK_URLS",
  "JUMPCLOUD_REQUIRE_VERIFIED_EMAIL",
  "JUMPCLOUD_ALLOW_EMAILPASS",
  "CLERK_ISSUER",
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_AUTHORIZED_PARTIES",
  "PRINTFUL_STORE_ID",
] as const;

export type ContainerEnvSource = Record<string, unknown> & {
  DATABASE_URL?: string;
  HYPERDRIVE?: { connectionString?: string };
};

/**
 * Env for the Medusa process inside the container.
 * Hyperdrive connection strings only work from Workers, not from the VM.
 */
export function containerEnv(env: ContainerEnvSource): Record<string, string> {
  const values: Record<string, string> = {
    NODE_ENV: "production",
    PORT: "9000",
    MEDUSA_WORKER_MODE: stringValue(env.MEDUSA_WORKER_MODE) || "shared",
    DISABLE_MEDUSA_ADMIN: stringValue(env.DISABLE_MEDUSA_ADMIN) || "false",
  };
  for (const key of [...SECRET_KEYS, ...VAR_KEYS]) {
    const value = stringValue(env[key]);
    if (value) values[key] = value;
  }
  return values;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
