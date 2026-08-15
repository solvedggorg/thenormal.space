## Development

This machine's `node` is often bun. Wrangler/Vite need real Node.js (the `ws` upgrade events bun does not implement). Use the project flake so Node wins:

```
nix develop
# or: direnv allow
```

Start the dev server through the package script (it refuses bun-as-node):

```
bun run dev --background
```

Equivalent: `astro dev --background` once `nix develop` / direnv is active.

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
