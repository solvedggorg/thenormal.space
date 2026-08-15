import {
  ContainerRegistrationKeys,
  defineConfig,
  loadEnv,
  Modules,
} from "@medusajs/framework/utils";

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

loadEnv(process.env.NODE_ENV || "development", process.cwd());

const redisUrl = process.env.REDIS_URL;
const r2FileUrl = process.env.S3_FILE_URL || "https://media.thenormal.space";
const r2ViaApi = Boolean(process.env.SHOP_API_URL && process.env.SHOP_MEDIA_SECRET);
const r2ViaS3 = Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID);
const backendUrl = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
const jumpcloudReady = Boolean(
  process.env.JUMPCLOUD_CLIENT_ID && process.env.JUMPCLOUD_CLIENT_SECRET,
);
const clerkReady = Boolean(
  process.env.CLERK_SECRET_KEY ||
    process.env.CLERK_JWT_KEY ||
    process.env.CLERK_ISSUER ||
    process.env.CLERK_PUBLISHABLE_KEY,
);
const stripeReady = Boolean(process.env.STRIPE_API_KEY);
const printfulReady = Boolean(process.env.PRINTFUL_API_TOKEN);
const userAuthMethods = jumpcloudReady
  ? process.env.JUMPCLOUD_ALLOW_EMAILPASS === "true"
    ? ["jumpcloud", "emailpass"]
    : ["jumpcloud"]
  : ["emailpass"];
const customerAuthMethods = clerkReady ? ["clerk"] : ["emailpass"];

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl,
    workerMode: (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") || "shared",
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
      authMethodsPerActor: {
        user: userAuthMethods,
        customer: customerAuthMethods,
      },
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: process.env.MEDUSA_BACKEND_URL,
  },
  plugins: printfulReady
    ? [
        {
          resolve: "@legenki/print2medusa",
          options: {
            apiToken: process.env.PRINTFUL_API_TOKEN,
            storeId: process.env.PRINTFUL_STORE_ID,
            webhookSecret: process.env.PRINTFUL_WEBHOOK_SECRET,
            liveShippingRates: true,
            fallbackShippingRates: { STANDARD: 800, PRINTFUL_RETURN: 800 },
            defaultCurrency: "EUR",
            allowPartialOrders: true,
            autoSubmitOrders: true,
          },
        },
      ]
    : [],
  modules: [
    ...(redisUrl
      ? [
          {
            resolve: "@medusajs/medusa/caching",
            options: {
              providers: [
                {
                  resolve: "@medusajs/caching-redis",
                  id: "caching-redis",
                  is_default: true,
                  options: { redisUrl: process.env.CACHE_REDIS_URL || redisUrl },
                },
              ],
            },
          },
          {
            resolve: "@medusajs/medusa/event-bus-redis",
            options: { redisUrl },
          },
          {
            resolve: "@medusajs/medusa/workflow-engine-redis",
            options: { redis: { redisUrl } },
          },
          {
            resolve: "@medusajs/medusa/locking",
            options: {
              providers: [
                {
                  resolve: "@medusajs/medusa/locking-redis",
                  id: "locking-redis",
                  is_default: true,
                  options: { redisUrl: process.env.LOCKING_REDIS_URL || redisUrl },
                },
              ],
            },
          },
        ]
      : []),
    ...(stripeReady
      ? [
          {
            resolve: "@medusajs/medusa/payment",
            options: {
              providers: [
                {
                  resolve: "@medusajs/medusa/payment-stripe",
                  id: "stripe",
                  options: {
                    apiKey: process.env.STRIPE_API_KEY,
                    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
                    automatic_payment_methods: true,
                    // POD: capture on authorize so print2medusa sees payment.captured.
                    capture: true,
                  },
                },
              ],
            },
          },
        ]
      : []),
    ...(printfulReady
      ? [
          {
            resolve: "@medusajs/medusa/fulfillment",
            dependencies: ["query"],
            options: {
              providers: [
                {
                  resolve: "@medusajs/medusa/fulfillment-manual",
                  id: "manual",
                },
                {
                  resolve: "@legenki/print2medusa/providers/printful-fulfillment",
                  id: "printful",
                  options: {
                    apiToken: process.env.PRINTFUL_API_TOKEN,
                    storeId: process.env.PRINTFUL_STORE_ID,
                  },
                },
              ],
            },
          },
        ]
      : []),
    ...(r2ViaApi
      ? [
          {
            resolve: "@medusajs/medusa/file",
            options: {
              providers: [
                {
                  resolve: "./src/modules/r2-file",
                  id: "r2",
                  options: {
                    fileUrl: r2FileUrl,
                    apiUrl: process.env.SHOP_API_URL,
                    secret: process.env.SHOP_MEDIA_SECRET,
                  },
                },
              ],
            },
          },
        ]
      : r2ViaS3
        ? [
            {
              resolve: "@medusajs/medusa/file",
              options: {
                providers: [
                  {
                    resolve: "@medusajs/medusa/file-s3",
                    id: "s3",
                    options: {
                      file_url: r2FileUrl,
                      access_key_id: process.env.S3_ACCESS_KEY_ID,
                      secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                      region: process.env.S3_REGION || "auto",
                      bucket: process.env.S3_BUCKET,
                      endpoint: process.env.S3_ENDPOINT,
                      additional_client_config: {
                        forcePathStyle: true,
                        requestChecksumCalculation: "WHEN_REQUIRED",
                        responseChecksumValidation: "WHEN_REQUIRED",
                      },
                    },
                  },
                ],
              },
            },
          ]
        : []),
    {
      resolve: "@medusajs/medusa/auth",
      dependencies: [Modules.CACHE, ContainerRegistrationKeys.LOGGER],
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/auth-emailpass",
            id: "emailpass",
          },
          ...(jumpcloudReady
            ? [
                {
                  resolve: "./src/modules/jumpcloud",
                  id: "jumpcloud",
                  options: {
                    clientId: process.env.JUMPCLOUD_CLIENT_ID,
                    clientSecret: process.env.JUMPCLOUD_CLIENT_SECRET,
                    redirectUri:
                      process.env.JUMPCLOUD_REDIRECT_URI || `${backendUrl}/app/login`,
                    issuer: process.env.JUMPCLOUD_ISSUER || "https://oauth.id.jumpcloud.com",
                    allowedEmailDomains: splitCsv(process.env.JUMPCLOUD_ALLOWED_EMAIL_DOMAINS),
                    allowedCallbackUrls: splitCsv(process.env.JUMPCLOUD_ALLOWED_CALLBACK_URLS),
                    requireVerifiedEmail: process.env.JUMPCLOUD_REQUIRE_VERIFIED_EMAIL === "true",
                  },
                },
              ]
            : []),
          ...(clerkReady
            ? [
                {
                  resolve: "./src/modules/clerk",
                  id: "clerk",
                  options: {
                    secretKey: process.env.CLERK_SECRET_KEY,
                    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
                    issuer: process.env.CLERK_ISSUER || "https://clerk.thenormal.space",
                    jwtKey: process.env.CLERK_JWT_KEY,
                    authorizedParties: splitCsv(
                      process.env.CLERK_AUTHORIZED_PARTIES ||
                        "https://shop.thenormal.space,http://localhost:4322,https://clerk.thenormal.space",
                    ),
                  },
                },
              ]
            : []),
        ],
      },
    },
  ],
});
