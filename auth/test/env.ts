import { generateSigningMaterial } from "../src/lib/jwt";
import { laterIso, nowIso, randomId, sha256Hex } from "../src/lib/crypto";
import { createMemoryStore } from "../src/store/memory";
import type { AuthStore, OAuthClient, User } from "../src/store/types";

export type MailCall = {
  to: string | string[];
  subject: string;
  from?: { email: string; name?: string } | string;
  text?: string;
  html?: string;
};

export function createMemoryKv() {
  const data = new Map<string, string>();
  return {
    data,
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
}

export async function createTestEnv(
  opts: {
    allowDevAccess?: boolean;
    accessJwks?: string;
    policyAud?: string;
    jumpcloud?: boolean;
    jumpcloudUser?: string;
  } = {},
) {
  const material = await generateSigningMaterial();
  const store = createMemoryStore();
  const kv = createMemoryKv();
  const sent: MailCall[] = [];
  const env = {
    ISSUER: "https://auth.thenormal.space",
    RP_NAME: "The Normal Space",
    MAIL_FROM: "auth@thenormal.space",
    MAIL_FROM_NAME: "The Normal Space",
    ADMIN_ORIGIN: "https://admin2.thenormal.space",
    ALLOW_DCR: "false",
    ALLOW_DEV_ORIGINS: "true",
    ALLOW_DEV_ACCESS: opts.allowDevAccess ? "true" : undefined,
    DEV_ACCESS_EMAIL: "dev@thenormal.space",
    AUTH_SIGNING_JWK: JSON.stringify(material.privateJwk),
    TEAM_DOMAIN: "https://iresolved-llc.cloudflareaccess.com",
    POLICY_AUD: opts.policyAud || "test-aud",
    ACCESS_JWKS: opts.accessJwks,
    JUMPCLOUD_CLIENT_ID: opts.jumpcloud ? "jc-client" : undefined,
    JUMPCLOUD_CLIENT_SECRET: opts.jumpcloud ? "jc-secret" : undefined,
    JUMPCLOUD_ISSUER: "https://oauth.id.jumpcloud.com",
    JUMPCLOUD_REDIRECT_URI: "https://admin2.thenormal.space/oidc/callback",
    TEST_JUMPCLOUD_USER: opts.jumpcloudUser,
    TEST_STORE: store,
    DB: {} as D1Database,
    KV: kv as unknown as KVNamespace,
    EMAIL: {
      async send(message: MailCall) {
        sent.push(message);
        return { messageId: "test" };
      },
    },
  } as Cloudflare.Env & { TEST_STORE: AuthStore };
  return { env, store, kv, sent, material };
}

export async function seedUser(store: AuthStore, email = "ada@lab.org"): Promise<User> {
  const now = nowIso();
  const user = await store.createUser({
    id: randomId(),
    email,
    name: "Ada",
    status: "active",
    email_verified_at: now,
    clerk_user_id: null,
    created_at: now,
    updated_at: now,
    last_login_at: now,
  });
  await store.createPasskey({
    id: randomId(),
    user_id: user.id,
    credential_id: "cred-" + user.id,
    public_key: "AAAA",
    counter: 0,
    transports: JSON.stringify(["internal"]),
    aaguid: null,
    name: "Test",
    created_at: now,
    last_used_at: now,
  });
  await store.createSession({
    id: "session-ada",
    user_id: user.id,
    aal: 2,
    amr: JSON.stringify(["pop"]),
    expires_at: laterIso(86_400_000),
    created_at: now,
    ip: "127.0.0.1",
    ua: "test",
    revoked_at: null,
  });
  return user;
}

export async function seedClient(store: AuthStore, type: "public" | "confidential" = "public"): Promise<{ client: OAuthClient; secret?: string }> {
  const now = nowIso();
  const secret = type === "confidential" ? "super-secret-client-value-32bytes-ok" : undefined;
  const client = await store.createClient({
    id: randomId(),
    client_id: "shop",
    client_secret_hash: secret ? await sha256Hex(secret) : null,
    name: "Shop",
    type,
    redirect_uris: JSON.stringify(["https://shop.thenormal.space/cb"]),
    grant_types: JSON.stringify(["authorization_code", "refresh_token", ...(type === "confidential" ? ["client_credentials"] : [])]),
    scopes: JSON.stringify(["openid", "profile", "email", "offline_access"]),
    first_party: 1,
    token_endpoint_auth_method: type === "confidential" ? "client_secret_basic" : "none",
    created_at: now,
    updated_at: now,
  });
  return { client, secret };
}
