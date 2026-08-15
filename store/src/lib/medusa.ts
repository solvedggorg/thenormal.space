import Medusa from "@medusajs/js-sdk";

export const medusaBackendUrl = (
  import.meta.env.PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
).replace(/\/$/, "");
export const medusaPublishableKey = import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY || "";

export const medusa = new Medusa({
  baseUrl: medusaBackendUrl,
  publishableKey: medusaPublishableKey || undefined,
  auth: { type: "jwt" },
  debug: Boolean(import.meta.env.DEV),
});
