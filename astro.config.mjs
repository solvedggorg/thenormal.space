// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

import react from '@astrojs/react';

// Cloudflare stays the adapter. Defaults auto-provision IMAGES + SESSION KV
// and open wrangler's inspector websocket — this site uses neither, and bun
// (this machine's `node`) does not implement ws upgrade events.
export default defineConfig({
	adapter: cloudflare({
		imageService: 'compile',
		prerenderEnvironment: 'node',
		inspectorPort: false,
	}),
	session: false,
	integrations: [react()],
	vite: {
		// Prebundle the header island's deps. A partial optimize left
		// motion/lucide as 404s and jsx-dev-runtime as the production stub,
		// so the nav failed to hydrate in `astro dev`.
		optimizeDeps: {
			include: [
				'react',
				'react-dom',
				'react/jsx-runtime',
				'react/jsx-dev-runtime',
				'motion/react',
				'lucide-react',
				'zustand',
			],
		},
	},
});