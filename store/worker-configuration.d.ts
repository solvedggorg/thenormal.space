declare namespace Cloudflare {
  interface Env {
    PUBLIC_API_URL: string;
    PUBLIC_MEDUSA_BACKEND_URL: string;
    PUBLIC_MEDUSA_PUBLISHABLE_KEY: string;
    PUBLIC_SITE_URL: string;
    PUBLIC_MARKETING_URL: string;
    PUBLIC_CLERK_PUBLISHABLE_KEY: string;
    SHOP_CACHE: KVNamespace;
    MEDIA: R2Bucket;
  }
}
