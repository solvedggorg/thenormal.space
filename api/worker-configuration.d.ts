// api/worker-configuration.d.ts
declare namespace Cloudflare {
  interface Env {
    SITE_URL: string;
    MAIL_FROM: string;
    CONTACT_TO: string;
    CONTACT_FROM: string;
    TURNSTILE_SECRET: string;
    TURNSTILE_SITE_KEY: string;
    ALLOW_DEV_ORIGINS: string;
    DB: D1Database;
    SHOP_DB: D1Database;
    SHOP_CACHE: KVNamespace;
    MEDIA: R2Bucket;
    SHOP_EVENTS: Queue;
    EMAIL: { send(message: unknown): Promise<void> };
    MEDUSA_BACKEND_URL: string;
    MEDUSA_PUBLISHABLE_KEY: string;
    SHOP_WEBHOOK_SECRET: string;
    SHOP_MEDIA_SECRET: string;
    ANALYTICS_DB?: D1Database;
    SINK_CACHE?: KVNamespace;
    SINK_RAW?: R2Bucket;
    SINK_EVENTS?: Queue;
    SINK?: AnalyticsEngineDataset;
    REALTIME?: DurableObjectNamespace;
    SINK_SALT?: string;
    SINK_INTERNAL_SECRET?: string;
  }
}
