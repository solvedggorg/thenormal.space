// auth/worker-configuration.d.ts
declare namespace Cloudflare {
  interface Env {
    ISSUER: string;
    RP_NAME: string;
    MAIL_FROM: string;
    MAIL_FROM_NAME: string;
    ADMIN_ORIGIN: string;
    ALLOW_DCR: string;
    ALLOW_DEV_ORIGINS?: string;
    ALLOW_DEV_ACCESS?: string;
    DEV_ACCESS_EMAIL?: string;
    AUTH_SIGNING_JWK: string;
    AUTH_PEPPER?: string;
    TURNSTILE_SECRET?: string;
    TURNSTILE_SITE_KEY?: string;
    TEAM_DOMAIN?: string;
    POLICY_AUD?: string;
    ACCESS_JWKS?: string;
    JUMPCLOUD_CLIENT_ID?: string;
    JUMPCLOUD_CLIENT_SECRET?: string;
    JUMPCLOUD_ISSUER?: string;
    JUMPCLOUD_REDIRECT_URI?: string;
    TEST_JUMPCLOUD_USER?: string;
    TEST_CLERK_USER?: string;
    TEST_CLERK_ID?: string;
    CLERK_PUBLISHABLE_KEY?: string;
    CLERK_SECRET_KEY?: string;
    CLERK_JWT_KEY?: string;
    CLERK_FRONTEND_API?: string;
    TEST_STORE?: import("./src/store/types").AuthStore;
    DB: D1Database;
    KV: KVNamespace;
    EMAIL: {
      send(message: {
        to: string | string[];
        from: { email: string; name?: string } | string;
        subject: string;
        text: string;
        html: string;
        replyTo?: string;
        headers?: Record<string, string>;
      }): Promise<{ messageId?: string }>;
    };
  }
}
