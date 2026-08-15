// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

export default defineConfig({
  adapter: cloudflare({
    imageService: "compile",
    prerenderEnvironment: "node",
    inspectorPort: false,
  }),
  trailingSlash: "never",
  session: false,
  integrations: [react()],
  server: {
    port: 4322,
  },
});
