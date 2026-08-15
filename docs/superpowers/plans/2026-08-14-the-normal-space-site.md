# The Normal Space Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first public The Normal Space site — Foundation header, dark full-viewport hero, three product pages, a forthcoming Watch slate, About, Contact, and a Foundation-shaped waitlist API.

**Architecture:** One Astro 7 + React + Cloudflare app in this repo. Content lives in `src/data`. The header is a trimmed port of `../awfixer.foundation/src/components/react/Header.tsx`. A sibling `api/` Hono worker owns subscribe/confirm/unsubscribe/contact. The site POSTs to `PUBLIC_API_URL` and fails with the locked copy when that URL is unset.

**Tech Stack:** Astro 7, React 19, Cloudflare adapter, Zustand (nav only, no persist), Motion, Lucide, Hono, D1, Cloudflare Email, Turnstile, bun:test.

**Spec:** `docs/superpowers/specs/2026-08-14-the-normal-space-site-design.md`

## Global Constraints

- Dark only. No `data-theme`, no theme toggle, no persist key.
- Fonts: Sora 600, Figtree 400/500/600, IBM Plex Mono 400/500 — copy the six `.woff2` files from Foundation.
- Tokens: `--bg #070707`, `--bg-wash #111110`, `--ink #F2F0EA`, `--ink-soft #C4C1B8`, `--muted #8A8882`, `--line rgba(242, 240, 234, 0.12)`, `--line-strong rgba(242, 240, 234, 0.22)`, `--invert #F2F0EA`, `--invert-ink #070707`.
- Brand: site `The Normal Space`, society `The Normal People Society`, email `hello@thenormal.space`, X `https://x.com/thenormalcorp`.
- Voice: literal, short, unpoetic. Locked strings in the spec are copied verbatim.
- No cart, CMS, legal pages, news, photography, or light theme.
- `prefers-reduced-motion`: skip line-reveal and springs; show final state.
- Store shape is only `{ navOpen, mega, setNavOpen, setMega }`. Persist nothing.
- Interests: `all | dishwasher | washing-machine | litter-box | films | television`.
- Contact topics: `things | watch | press | other`.
- Dev server: `astro dev --background` (see `AGENTS.md`).

## File map

| File | Responsibility |
| --- | --- |
| `shared/catalog.ts` | `INTERESTS`, `Interest`, `CONTACT_TOPICS`, `ContactTopic` — single source for site and api |
| `src/data/site.ts` | Brand, nav groups, footer columns, X URL; re-exports the catalog enums |
| `src/data/products.ts` | The three things |
| `src/data/watch.ts` | Forthcoming slate |
| `src/data/site.test.ts` | Locks brand, nav ids, routes, interests |
| `src/store/app.ts` | Nav open + mega only |
| `src/lib/motion.ts` | `easeOut`, `lineReveal` |
| `src/lib/api.ts` | `apiUrl`, `listIsLive()` |
| `src/lib/forms.ts` | `subscribeBody`, `contactBody` |
| `src/lib/forms.test.ts` | Body builders |
| `src/styles/global.css` | Tokens, header, hero, page, footer, forms |
| `src/layouts/Layout.astro` | Dark document shell, Header, Footer |
| `src/components/react/Header.tsx` | Ported Foundation header |
| `src/components/react/Hero.tsx` | Full-viewport home hero |
| `src/components/react/NotifyForm.tsx` | Waitlist |
| `src/components/react/ContactForm.tsx` | Contact |
| `src/components/Footer.astro` | Columns + stacked wordmark |
| `src/components/BrandWordmark.astro` | Stacked “normal” |
| `src/pages/*.astro` | Home, three products, watch, about, contact, 404 |
| `api/src/*` | Hono worker |
| `public/fonts/*` | The six woff2 files |

Do not port Foundation explorers, atlas, give, news, theme, or TempleMark.

---

### Task 1: Site data

**Files:**
- Create: `shared/catalog.ts`
- Create: `src/data/site.ts`
- Create: `src/data/products.ts`
- Create: `src/data/watch.ts`
- Test: `src/data/site.test.ts`
- Modify: `package.json` — add `"test": "bun test src api/test"`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `brand.name: "The Normal Space"`
  - `brand.society: "The Normal People Society"`
  - `brand.url: "https://thenormal.space"`
  - `brand.email.hello: "hello@thenormal.space"`
  - `brand.social.x: "https://x.com/thenormalcorp"`
  - `export type MegaId = "things" | "watch" | "about"`
  - `export type NavIcon = "droplets" | "wash" | "box" | "eye" | "newspaper" | "info" | "list" | "mail"`
  - `shared/catalog.ts` owns `Interest`, `INTERESTS`, `ContactTopic`, `CONTACT_TOPICS`
  - `src/data/site.ts` re-exports those four names so site imports stay `from "../data/site"`
  - `navGroups: NavGroup[]` with `id: MegaId`
  - `navCta: { href: "/#notify"; label: "Notify" }`
  - `products: Product[]` — `slug`, `name`, `href`, `sentence`, `paragraph`, `interest`
  - `films` / `shows`: `{ title, logline, interest }[]`
  - `footer: FooterColumn[]`

- [ ] **Step 1: Add the test script and write the failing data tests**

In `package.json` scripts, add `"test": "bun test src api/test"`.

Create `src/data/site.test.ts`:

```ts
import { expect, test } from "bun:test";
import { brand, CONTACT_TOPICS, footer, INTERESTS, navCta, navGroups } from "./site";
import { products } from "./products";
import { films, shows } from "./watch";

test("brand lockup strings", () => {
  expect(brand.name).toBe("The Normal Space");
  expect(brand.society).toBe("The Normal People Society");
  expect(brand.url).toBe("https://thenormal.space");
  expect(brand.email.hello).toBe("hello@thenormal.space");
  expect(brand.social.x).toBe("https://x.com/thenormalcorp");
});

test("nav groups, cta, and icon set", () => {
  expect(navGroups.map((group) => group.id)).toEqual(["things", "watch", "about"]);
  expect(navGroups[0]?.href).toBe("/dishwasher");
  expect(navGroups[0]?.children.map((child) => child.href)).toEqual([
    "/dishwasher",
    "/washing-machine",
    "/litter-box",
  ]);
  expect(navGroups[1]?.children.map((child) => child.href)).toEqual(["/watch#films", "/watch#television"]);
  expect(navGroups[2]?.children.map((child) => child.href)).toEqual(["/about", "/about#why", "/contact"]);
  expect(navCta).toEqual({ href: "/#notify", label: "Notify" });
  const icons = navGroups.flatMap((group) => group.children.map((child) => child.icon));
  expect(new Set(icons)).toEqual(
    new Set(["droplets", "wash", "box", "eye", "newspaper", "info", "list", "mail"]),
  );
});

test("products and slate", () => {
  expect(products.map((item) => item.slug)).toEqual(["dishwasher", "washing-machine", "litter-box"]);
  expect(products.map((item) => item.interest)).toEqual(["dishwasher", "washing-machine", "litter-box"]);
  expect(films.map((item) => item.title)).toEqual(["Tuesday", "The Drive Home"]);
  expect(shows.map((item) => item.title)).toEqual(["Ordinary Time", "Neighbors"]);
  expect(films.every((item) => item.interest === "films")).toBe(true);
  expect(shows.every((item) => item.interest === "television")).toBe(true);
});

test("interest and topic enums", () => {
  expect([...INTERESTS]).toEqual([
    "all",
    "dishwasher",
    "washing-machine",
    "litter-box",
    "films",
    "television",
  ]);
  expect([...CONTACT_TOPICS]).toEqual(["things", "watch", "press", "other"]);
});

test("footer columns", () => {
  expect(footer.map((column) => column.title)).toEqual(["Things", "Watch", "About", "Society"]);
  const society = footer.find((column) => column.title === "Society");
  expect(society?.links.map((link) => link.href)).toEqual([
    "/contact",
    "https://x.com/thenormalcorp",
    "/#notify",
  ]);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun test src/data/site.test.ts`

Expected: FAIL — `Cannot find module './site'` (or products/watch).

- [ ] **Step 3: Write the data modules**

`shared/catalog.ts`:

```ts
export const INTERESTS = [
  "all",
  "dishwasher",
  "washing-machine",
  "litter-box",
  "films",
  "television",
] as const;

export type Interest = (typeof INTERESTS)[number];

export const CONTACT_TOPICS = ["things", "watch", "press", "other"] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];
```

`src/data/site.ts`:

```ts
export type { ContactTopic, Interest } from "../../shared/catalog";
export { CONTACT_TOPICS, INTERESTS } from "../../shared/catalog";

export const brand = {
  name: "The Normal Space",
  society: "The Normal People Society",
  tagline: "Normal things for everything you want to do.",
  description: "We make normal things. No app, no wifi, no location sharing.",
  url: "https://thenormal.space",
  email: { hello: "hello@thenormal.space" },
  social: { x: "https://x.com/thenormalcorp" },
} as const;

export type MegaId = "things" | "watch" | "about";
export type NavIcon = "droplets" | "wash" | "box" | "eye" | "newspaper" | "info" | "list" | "mail";

export type NavChild = {
  name: string;
  href: string;
  description: string;
  icon: NavIcon;
  external?: boolean;
};

export type NavGroup = {
  id: MegaId;
  name: string;
  href: string;
  description: string;
  children: NavChild[];
};

export const navGroups: NavGroup[] = [
  {
    id: "things",
    name: "Things",
    href: "/dishwasher",
    description: "Objects that do the job.",
    children: [
      {
        name: "Dishwasher",
        href: "/dishwasher",
        description: "Washes dishes. You put them in, you take them out.",
        icon: "droplets",
      },
      {
        name: "Washing Machine",
        href: "/washing-machine",
        description: "Washes clothes. Same idea.",
        icon: "wash",
      },
      {
        name: "Litter Box",
        href: "/litter-box",
        description: "Holds litter. You scoop it.",
        icon: "box",
      },
    ],
  },
  {
    id: "watch",
    name: "Watch",
    href: "/watch",
    description: "Pictures under the same rule.",
    children: [
      { name: "Films", href: "/watch#films", description: "Pictures. Forthcoming.", icon: "eye" },
      { name: "Television", href: "/watch#television", description: "Episodes. Forthcoming.", icon: "newspaper" },
    ],
  },
  {
    id: "about",
    name: "About",
    href: "/about",
    description: "Who makes this, and why.",
    children: [
      { name: "The Society", href: "/about", description: "The Normal People Society", icon: "info" },
      { name: "Why normal", href: "/about#why", description: "No app, no wifi, no location", icon: "list" },
      { name: "Contact", href: "/contact", description: "Things, watch, press, other", icon: "mail" },
    ],
  },
];

export const navCta = { href: "/#notify", label: "Notify" } as const;

export type FooterLink = { href: string; label: string; external?: boolean };
export type FooterColumn = { title: string; links: FooterLink[] };

export const footer: FooterColumn[] = [
  {
    title: "Things",
    links: [
      { href: "/dishwasher", label: "Dishwasher" },
      { href: "/washing-machine", label: "Washing Machine" },
      { href: "/litter-box", label: "Litter Box" },
    ],
  },
  {
    title: "Watch",
    links: [
      { href: "/watch#films", label: "Films" },
      { href: "/watch#television", label: "Television" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/about", label: "The Society" },
      { href: "/about#why", label: "Why normal" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Society",
    links: [
      { href: "/contact", label: "Contact" },
      { href: brand.social.x, label: "X", external: true },
      { href: "/#notify", label: "Notify" },
    ],
  },
];
```

`src/data/products.ts`:

```ts
import type { Interest } from "./site";

export type Product = {
  slug: "dishwasher" | "washing-machine" | "litter-box";
  name: string;
  href: string;
  sentence: string;
  paragraph: string;
  interest: Interest;
};

export const products: Product[] = [
  {
    slug: "dishwasher",
    name: "Dishwasher",
    href: "/dishwasher",
    sentence: "Washes dishes. You put them in, you take them out.",
    paragraph: "Washes dishes. You put them in, you take them out.",
    interest: "dishwasher",
  },
  {
    slug: "washing-machine",
    name: "Washing Machine",
    href: "/washing-machine",
    sentence: "Washes clothes. Same idea.",
    paragraph: "Washes clothes. Same idea.",
    interest: "washing-machine",
  },
  {
    slug: "litter-box",
    name: "Litter Box",
    href: "/litter-box",
    sentence: "Holds litter. You scoop it.",
    paragraph: "Holds litter. You scoop it. That is the product.",
    interest: "litter-box",
  },
];

export function productBySlug(slug: string): Product | undefined {
  return products.find((item) => item.slug === slug);
}
```

`src/data/watch.ts`:

```ts
import type { Interest } from "./site";

export type Title = {
  title: string;
  logline: string;
  kind: "Film" | "Television";
  interest: Interest;
};

export const films: Title[] = [
  { title: "Tuesday", logline: "A day. Nothing else is scheduled.", kind: "Film", interest: "films" },
  {
    title: "The Drive Home",
    logline: "Two people in a car. The radio works.",
    kind: "Film",
    interest: "films",
  },
];

export const shows: Title[] = [
  { title: "Ordinary Time", logline: "A season of weeks. No twist.", kind: "Television", interest: "television" },
  { title: "Neighbors", logline: "The people next door, left alone.", kind: "Television", interest: "television" },
];
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun test src/data/site.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add package.json shared/catalog.ts src/data/site.ts src/data/products.ts src/data/watch.ts src/data/site.test.ts
git commit -m "feat: lock The Normal Space brand, nav, products, and slate"
```

---

### Task 2: Tokens, fonts, layout, store

**Files:**
- Create: `public/fonts/` — six woff2 files copied from Foundation
- Create: `src/styles/global.css`
- Create: `src/lib/motion.ts`
- Create: `src/store/app.ts`
- Create: `src/lib/api.ts`
- Modify: `src/layouts/Layout.astro`
- Modify: `src/pages/index.astro` — empty main so Layout can render
- Delete later (Task 5): `src/components/Welcome.astro`

**Interfaces:**
- Consumes: `brand` from `src/data/site.ts`
- Produces:
  - CSS custom properties named exactly as in Global Constraints
  - `useAppStore(): { navOpen: boolean; mega: MegaId | null; setNavOpen(open: boolean): void; setMega(mega: MegaId | null): void }`
  - `easeOut`, `lineReveal` from `src/lib/motion.ts`
  - `apiUrl: string`, `listIsLive(): boolean`
  - `Layout` props: `{ title?: string; description?: string }`

- [ ] **Step 1: Copy fonts**

```bash
mkdir -p public/fonts
cp ../awfixer.foundation/public/fonts/sora-600.woff2 \
   ../awfixer.foundation/public/fonts/figtree-400.woff2 \
   ../awfixer.foundation/public/fonts/figtree-500.woff2 \
   ../awfixer.foundation/public/fonts/figtree-600.woff2 \
   ../awfixer.foundation/public/fonts/ibm-plex-mono-400.woff2 \
   ../awfixer.foundation/public/fonts/ibm-plex-mono-500.woff2 \
   public/fonts/
```

Confirm six files exist. Do not copy `og.png` yet.

- [ ] **Step 2: Write motion, api helper, and the slim store**

`src/lib/motion.ts` — copy `../awfixer.foundation/src/lib/motion.ts` unchanged.

`src/lib/api.ts`:

```ts
export const apiUrl = (import.meta.env.PUBLIC_API_URL || "").replace(/\/$/, "");

export function listIsLive(): boolean {
  return apiUrl.length > 0;
}
```

`src/store/app.ts`:

```ts
import { create } from "zustand";
import type { MegaId } from "../data/site";

interface AppState {
  navOpen: boolean;
  mega: MegaId | null;
  setNavOpen: (open: boolean) => void;
  setMega: (mega: MegaId | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  navOpen: false,
  mega: null,
  setNavOpen: (navOpen) => set({ navOpen, mega: navOpen ? get().mega : null }),
  setMega: (mega) => set({ mega }),
}));
```

Install the store dependency (Header in Task 3 needs the others too — install all three now):

```bash
bun add zustand motion lucide-react
```

- [ ] **Step 3: Write `src/styles/global.css`**

Start from Foundation `src/styles/global.css` and keep only:

1. All `@font-face` rules (lines 1–47)
2. `:root` tokens — **replace** the Foundation values with:

```css
:root {
  --bg: #070707;
  --bg-wash: #111110;
  --ink: #f2f0ea;
  --ink-soft: #c4c1b8;
  --muted: #8a8882;
  --line: rgba(242, 240, 234, 0.12);
  --line-strong: rgba(242, 240, 234, 0.22);
  --card: #111110;
  --invert: #f2f0ea;
  --invert-ink: #070707;
  --halo: rgba(242, 240, 234, 0.06);
  --radius: 12px;
  --radius-pill: 999px;
  --font-display: "Sora", system-ui, sans-serif;
  --font-body: "Figtree", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --pad: clamp(1.15rem, 3.6vw, 2.4rem);
  --max: 1180px;
  --header: 80px;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
}
```

3. Delete the entire `[data-theme="dark"]` block.
4. Keep reset / skip / wrap / eyebrow / display / lede / btn / btn-row / section / section-head / banner (Foundation lines 86–325).
5. Keep the full Header block through `.mobile-foot .header-cta` (Foundation lines 326–750).
6. Keep `.field`, `.notice` (lines 1321–1352).
7. Keep footer rules (lines 1551–1769) except drop `.footer-subscribe*` and `.footer-pill*` / `@keyframes footer-dot`. Footer stays a black plate (`--footer-bg: #000000`).
8. Keep the 981px header media query that shows `.nav-desktop` and `.header-cta` (lines 1906–1919).
9. Keep `prefers-reduced-motion` scroll-behavior rule.
10. Do **not** copy explorer, atlas, news, give, hero-mark, or `[data-theme]`.

Then add these new rules (home hero is a full viewport; inner pages use `.page` so they clear the overlay nav):

```css
body {
  padding-top: 0;
}

.page {
  padding-top: var(--header);
}

.hero {
  min-height: 100svh;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: calc(var(--header) + 1rem) var(--pad) 3rem;
}

.hero-frame {
  width: min(var(--max), 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-title {
  font-size: clamp(3.3rem, 11vw, 7.6rem);
  max-width: 14ch;
}

.hero-line {
  display: block;
  overflow: hidden;
}

.hero-line > span {
  display: block;
}

.hero-word {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.12em;
}

.hero-copy {
  margin-top: 1.5rem;
  max-width: 32rem;
  color: var(--ink-soft);
  font-size: 1.12rem;
}

.thing-grid,
.slate-list {
  display: grid;
  gap: 0.8rem;
}

.thing-card,
.slate-card {
  display: block;
  padding: 1.2rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: 16px;
  text-decoration: none;
  background: var(--bg-wash);
}

.thing-card:hover,
.slate-card:hover {
  border-color: var(--line-strong);
}

.thing-card h3,
.slate-card h3 {
  font-family: var(--font-display);
  font-size: 1.45rem;
  letter-spacing: -0.03em;
  font-weight: 600;
}

.thing-card p,
.slate-card p {
  margin-top: 0.4rem;
  color: var(--ink-soft);
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.2rem;
  margin: 1.2rem 0;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

@media (min-width: 800px) {
  .thing-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 981px) {
  .footer-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
```

- [ ] **Step 4: Replace Layout**

`src/layouts/Layout.astro`:

```astro
---
import '../styles/global.css';
import { brand } from '../data/site';

interface Props {
	title?: string;
	description?: string;
}

const { title, description = brand.description } = Astro.props;
const pageTitle = title ? `${title} | ${brand.name}` : `${brand.name} — ${brand.tagline}`;
const path = Astro.url.pathname;
const canonical = new URL(path, brand.url).toString();
---

<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
		<link rel="icon" href="/favicon.ico" />
		<meta name="generator" content={Astro.generator} />
		<title>{pageTitle}</title>
		<meta name="description" content={description} />
		<link rel="canonical" href={canonical} />
		<meta name="theme-color" content="#070707" />
		<link rel="preload" href="/fonts/sora-600.woff2" as="font" type="font/woff2" crossorigin />
		<link rel="preload" href="/fonts/figtree-400.woff2" as="font" type="font/woff2" crossorigin />
		<link rel="preload" href="/fonts/figtree-600.woff2" as="font" type="font/woff2" crossorigin />
	</head>
	<body>
		<a class="skip" href="#main">Skip to content</a>
		<slot name="header" />
		<main id="main">
			<slot />
		</main>
		<slot name="footer" />
	</body>
</html>
```

Header and Footer land in Tasks 3–4. For this task only, `index.astro` should render Layout with an empty main (delete the Welcome import so the page typechecks). Temporarily comment nothing — just:

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout>
	<p class="wrap page">The Normal Space</p>
</Layout>
```

- [ ] **Step 5: Typecheck**

Run: `bunx astro check`

Expected: no errors from the new files. Welcome.astro may still exist unused; leave it until Task 5.

- [ ] **Step 6: Commit**

```bash
git add public/fonts src/styles/global.css src/lib/motion.ts src/lib/api.ts src/store/app.ts src/layouts/Layout.astro src/pages/index.astro package.json bun.lock
git commit -m "feat: add dark tokens, fonts, layout, and nav store"
```

---

### Task 3: Header

**Files:**
- Create: `src/components/react/Header.tsx`
- Modify: `src/layouts/Layout.astro` — mount `<Header client:load path={path} />`

**Interfaces:**
- Consumes: `navGroups`, `navCta`, `brand`, `MegaId`, `NavIcon` from `src/data/site.ts`; `useAppStore` from `src/store/app.ts`; `easeOut` from `src/lib/motion.ts`
- Produces: `<Header path: string />` with no theme control

- [ ] **Step 1: Copy Foundation Header and apply this exact edit list**

```bash
cp ../awfixer.foundation/src/components/react/Header.tsx src/components/react/Header.tsx
```

Edits, all required:

1. Change the site import to `from "../../data/site"` and import `brand` as well as `navCta, navGroups, type NavChild, type NavGroup`.
2. Change the store import to `from "../../store/app"` and type `mega` against `MegaId | null`. Remove `toggleTheme`, `theme`.
3. Delete the `TempleMark` import and the theme button (the `icon-btn` that renders `●`/`○`).
4. Replace `iconMap` with only:

```ts
import { Box, Droplets, Eye, Info, ListOrdered, Mail, Newspaper, WashingMachine } from "lucide-react";

const iconMap: Record<NavChild["icon"], ComponentType<{ className?: string }>> = {
  droplets: Droplets,
  wash: WashingMachine,
  box: Box,
  eye: Eye,
  newspaper: Newspaper,
  info: Info,
  list: ListOrdered,
  mail: Mail,
};
```

If `WashingMachine` is not exported by the installed `lucide-react`, use `Waves` and keep the key `wash`. Do not add unused Foundation icons.

5. Brand link:

```tsx
<a className="brand" href="/" aria-label={`${brand.name} home`}>
  <span className="brand-lockup">
    <span className="brand-name">{brand.name}</span>
    <span className="brand-by">by {brand.society}</span>
  </span>
</a>
```

6. Ghost CTA: `<a className="header-cta-ghost" href="/contact">Contact</a>`
7. Solid CTA: `<a className="header-cta" href={navCta.href}>{navCta.label}</a>`
8. Delete the mobile “Use light theme” button.
9. Replace `current(href)` so a group trigger is current when the path matches the group href **or any child pathname** (strip hashes):

```ts
function pathOf(href: string) {
  return href.split("#")[0] || href;
}

const current = (href: string) =>
  path === pathOf(href) || (pathOf(href) !== "/" && path.startsWith(`${pathOf(href)}/`))
    ? "page"
    : undefined;

const groupCurrent = (group: NavGroup) =>
  current(group.href) || group.children.some((child) => current(child.href)) ? "page" : undefined;
```

Use `groupCurrent(group)` on group triggers. Use `current(item.href)` only if a lone `navLinks` row exists — this site has none, so delete the `navLinks` loop.

10. Delete `ready` / `useState` if it only existed for the theme flash. Keep `useHeaderProgress`, Escape, resize, body scroll lock, 140ms mega close.

- [ ] **Step 2: Mount the header**

In `Layout.astro`, import Header and render it before `<main>` (not as a named slot — replace the header slot):

```astro
import Header from '../components/react/Header';
...
<Header client:load path={path} />
```

Remove `slot name="header"`.

- [ ] **Step 3: Smoke the header**

Run: `astro dev --background` then open `/`.

Check:

- Lockup reads “The Normal Space” / “by The Normal People Society”
- Things / Watch / About megas open with the locked children
- No theme button
- Contact ghost + Notify pill
- Mobile ☰ opens the accordion; no light-theme row
- Scroll shrinks the glass bar

Stop when done: `astro dev stop`.

- [ ] **Step 4: Commit**

```bash
git add src/components/react/Header.tsx src/layouts/Layout.astro package.json bun.lock
git commit -m "feat: port Foundation header for The Normal Space"
```

---

### Task 4: Footer and 404

**Files:**
- Create: `src/components/BrandWordmark.astro`
- Create: `src/components/Footer.astro`
- Create: `src/pages/404.astro`
- Modify: `src/layouts/Layout.astro` — mount Footer after `<main>`

**Interfaces:**
- Consumes: `brand`, `footer` from `src/data/site.ts`
- Produces: Footer with four columns; 404 copy `This page is not here.`

- [ ] **Step 1: Port BrandWordmark**

```bash
cp ../awfixer.foundation/src/components/BrandWordmark.astro src/components/BrandWordmark.astro
```

Change the default `text` from `"foundation"` to `"normal"`. Leave the stacked-stroke CSS. It already uses `var(--font-display)` and light stroke colors that read on the black footer plate.

- [ ] **Step 2: Write Footer**

`src/components/Footer.astro`:

```astro
---
import { brand, footer } from '../data/site';
import BrandWordmark from './BrandWordmark.astro';

const year = new Date().getFullYear();
---

<footer class="footer" id="site-footer">
	<div class="wrap footer-inner">
		<nav class="footer-grid" aria-label="Footer">
			{
				footer.map((column) => (
					<div>
						<h3>{column.title}</h3>
						<ul>
							{column.links.map((item) => (
								<li>
									<a
										href={item.href}
										target={item.external ? '_blank' : undefined}
										rel={item.external ? 'noreferrer' : undefined}
									>
										{item.label}
									</a>
								</li>
							))}
						</ul>
					</div>
				))
			}
		</nav>
		<div class="footer-bottom">
			<p class="footer-copy">© {year} {brand.society}.</p>
			<div class="footer-meta">
				<a class="footer-social" href={brand.social.x} target="_blank" rel="noreferrer" aria-label="The Normal People Society on X">
					<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
						<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l-7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"></path>
					</svg>
				</a>
			</div>
		</div>
	</div>
	<BrandWordmark text="normal" />
</footer>
```

No subscribe form in the footer. Notify lives on the home band and product pages.

Mount in Layout after `</main>`:

```astro
import Footer from '../components/Footer.astro';
...
<Footer />
```

Remove `slot name="footer"`.

- [ ] **Step 3: Write 404**

`src/pages/404.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
---

<Layout title="Not here">
	<section class="page section">
		<div class="wrap">
			<p class="eyebrow">404</p>
			<h1 class="display" style="font-size: clamp(2.6rem, 7vw, 5.4rem);">This page is not here.</h1>
			<p class="lede" style="margin-top: 1.2rem;">
				<a href="/">Go home</a>
			</p>
		</div>
	</section>
</Layout>
```

- [ ] **Step 4: Check**

Run: `bunx astro check`

Expected: pass. Open `/not-a-page` on the dev server and confirm the 404 copy and the footer columns.

- [ ] **Step 5: Commit**

```bash
git add src/components/BrandWordmark.astro src/components/Footer.astro src/pages/404.astro src/layouts/Layout.astro
git commit -m "feat: add footer, stacked wordmark, and 404"
```

---

### Task 5: Home

**Files:**
- Create: `src/components/react/Hero.tsx`
- Modify: `src/pages/index.astro`
- Delete: `src/components/Welcome.astro`, `src/assets/astro.svg`, `src/assets/background.svg` if nothing else imports them

**Interfaces:**
- Consumes: `products` from `src/data/products.ts`; `films`, `shows` from `src/data/watch.ts`; `easeOut`, `lineReveal`
- Produces: full-viewport hero with locked copy; `#things`, `#watch`, `#notify` sections. `#notify` is an empty `<section id="notify">` heading + placeholder paragraph until Task 8 mounts `NotifyForm`.

- [ ] **Step 1: Write Hero**

`src/components/react/Hero.tsx`:

```tsx
import { motion, useReducedMotion } from "motion/react";
import { easeOut, lineReveal } from "../../lib/motion";

const lines = [
  { text: "Normal things", mark: "Normal" },
  { text: "for everything", mark: null },
  { text: "you want to do.", mark: null },
];

export default function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="hero">
      <div className="hero-frame">
        <motion.a
          className="banner"
          href="/about#why"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeOut }}
        >
          No app · No wifi · No location
        </motion.a>

        <h1 className="display hero-title">
          {lines.map((line, index) => (
            <span className="hero-line" key={line.text}>
              <motion.span
                initial={reduce ? false : "hidden"}
                animate="show"
                variants={lineReveal}
                transition={{ duration: 0.9, ease: easeOut, delay: 0.08 + index * 0.09 }}
              >
                {line.mark ? (
                  <>
                    <span className="hero-word">{line.mark}</span>
                    {line.text.slice(line.mark.length)}
                  </>
                ) : (
                  line.text
                )}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          className="hero-copy"
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: easeOut, delay: 0.46 }}
        >
          No app, no wifi, no location sharing. Functional, quiet.
        </motion.p>

        <motion.div
          className="btn-row"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: easeOut, delay: 0.58 }}
        >
          <a className="btn btn-primary" href="#notify">
            Notify me
          </a>
          <a className="btn btn-ghost" href="#things">
            See the things
          </a>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Write the home page**

`src/pages/index.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
import Hero from '../components/react/Hero';
import { products } from '../data/products';
import { films, shows } from '../data/watch';

const slate = [...films, ...shows];
const notifyFlag = Astro.url.searchParams.get('notify');
const notifyNotice =
	notifyFlag === 'confirmed'
		? 'You are on the list.'
		: notifyFlag === 'unsubscribed'
			? 'You are off the list.'
			: notifyFlag === 'missing'
				? 'That link did not work.'
				: null;
---

<Layout>
	<Hero client:load />

	<section class="section" id="things">
		<div class="wrap">
			<p class="eyebrow">Things</p>
			<div class="section-head">
				<h2>Normal things.</h2>
			</div>
			<div class="thing-grid">
				{
					products.map((item) => (
						<a class="thing-card" href={item.href}>
							<h3>{item.name}</h3>
							<p>{item.sentence}</p>
						</a>
					))
				}
			</div>
		</div>
	</section>

	<section class="section" id="watch">
		<div class="wrap">
			<div class="kicker-row">
				<p class="eyebrow">Watch</p>
				<a href="/watch">All of it</a>
			</div>
			<div class="slate-list">
				{
					slate.map((item) => (
						<a class="slate-card" href="/watch">
							<h3>{item.title}</h3>
							<p>
								{item.kind}. {item.logline}
							</p>
						</a>
					))
				}
			</div>
		</div>
	</section>

	<section class="section" id="notify">
		<div class="wrap">
			<p class="eyebrow">Notify</p>
			<h2 class="display" style="font-size: clamp(2rem, 4.6vw, 3.4rem);">Get a note when a thing is ready.</h2>
			{notifyNotice ? <p class="notice">{notifyNotice}</p> : null}
			<p class="lede" data-notify-slot>The form lands in a later task.</p>
		</div>
	</section>
</Layout>
```

Delete `Welcome.astro` and unused Welcome assets.

- [ ] **Step 3: Verify in the browser**

`astro dev --background`. Desktop and a 390-wide viewport:

- First screen is the dark hero, nav floating over it, “normal” underlined
- Pill goes to `/about#why` (404 is fine until Task 7)
- Notify me scrolls to `#notify`
- See the things scrolls to three cards
- `/?notify=confirmed` shows `You are on the list.`
- No Welcome / Astro logo

- [ ] **Step 4: Commit**

```bash
git add src/components/react/Hero.tsx src/pages/index.astro
git rm -f src/components/Welcome.astro src/assets/astro.svg src/assets/background.svg 2>/dev/null || true
git commit -m "feat: add full-viewport home hero and thing/watch bands"
```

---

### Task 6: Product pages

**Files:**
- Create: `src/pages/dishwasher.astro`
- Create: `src/pages/washing-machine.astro`
- Create: `src/pages/litter-box.astro`

Three files, same template, different `slug`. Do not invent a dynamic route — the spec lists three concrete paths.

**Interfaces:**
- Consumes: `productBySlug` / `products` from `src/data/products.ts`
- Produces: kicker `Thing`, display name, facts `No app.` `No wifi.` `No location sharing.`, paragraph, `#notify` heading. Form in Task 8.

- [ ] **Step 1: Write the three pages**

Each file (example `dishwasher.astro`; change the slug in the other two):

```astro
---
import Layout from '../layouts/Layout.astro';
import { productBySlug } from '../data/products';

const product = productBySlug('dishwasher');
if (!product) throw new Error('missing product');
---

<Layout title={product.name} description={product.sentence}>
	<section class="page section">
		<div class="wrap article">
			<p class="eyebrow">Thing</p>
			<h1 class="display" style="font-size: clamp(2.6rem, 7vw, 5.4rem);">{product.name}</h1>
			<p class="facts">
				<span>No app.</span>
				<span>No wifi.</span>
				<span>No location sharing.</span>
			</p>
			<p class="lede">{product.paragraph}</p>
			<div id="notify" style="margin-top: 2.4rem;">
				<p class="eyebrow">Notify</p>
				<p class="lede" data-notify-interest={product.interest}>The form lands in a later task.</p>
			</div>
		</div>
	</section>
</Layout>
```

Add to `global.css` if Task 2 did not copy it:

```css
.article { max-width: 42rem; }
```

- [ ] **Step 2: Verify**

Open `/dishwasher`, `/washing-machine`, `/litter-box`. Things mega should show `aria-current="page"`. Copy matches `products.ts`. Header still overlays; `.page` clears it.

- [ ] **Step 3: Commit**

```bash
git add src/pages/dishwasher.astro src/pages/washing-machine.astro src/pages/litter-box.astro src/styles/global.css
git commit -m "feat: add dishwasher, washing machine, and litter box pages"
```

---

### Task 7: Watch and About

**Files:**
- Create: `src/pages/watch.astro`
- Create: `src/pages/about.astro`

**Interfaces:**
- Consumes: `films`, `shows`; `brand`
- Produces: `/watch#films`, `/watch#television`, `/about`, `/about#why`

- [ ] **Step 1: Write Watch**

```astro
---
import Layout from '../layouts/Layout.astro';
import { films, shows } from '../data/watch';
---

<Layout title="Watch" description="Pictures under the same rule.">
	<section class="page section">
		<div class="wrap">
			<p class="eyebrow">Forthcoming</p>
			<h1 class="display" style="font-size: clamp(2.6rem, 7vw, 5.4rem); max-width: 14ch;">
				Pictures under the same rule.
			</h1>
			<p class="lede" style="margin-top: 1.2rem;">We make pictures under the same rule.</p>
		</div>
	</section>

	<section class="section" id="films">
		<div class="wrap">
			<p class="eyebrow">Films</p>
			<div class="slate-list">
				{
					films.map((item) => (
						<article class="slate-card">
							<p class="eyebrow">{item.kind}</p>
							<h2>{item.title}</h2>
							<p>{item.logline}</p>
							<p class="facts"><span>Forthcoming</span></p>
							<p data-notify-interest={item.interest}>Notify</p>
						</article>
					))
				}
			</div>
		</div>
	</section>

	<section class="section" id="television">
		<div class="wrap">
			<p class="eyebrow">Television</p>
			<div class="slate-list">
				{
					shows.map((item) => (
						<article class="slate-card">
							<p class="eyebrow">{item.kind}</p>
							<h2>{item.title}</h2>
							<p>{item.logline}</p>
							<p class="facts"><span>Forthcoming</span></p>
							<p data-notify-interest={item.interest}>Notify</p>
						</article>
					))
				}
			</div>
		</div>
	</section>
</Layout>
```

- [ ] **Step 2: Write About**

```astro
---
import Layout from '../layouts/Layout.astro';
import { brand } from '../data/site';
---

<Layout title="About" description="The Normal People Society makes normal things, and it makes pictures, under one rule.">
	<section class="page section">
		<div class="wrap article">
			<p class="eyebrow">The Society</p>
			<h1 class="display" style="font-size: clamp(2.6rem, 7vw, 5.4rem); max-width: 16ch;">
				The Normal People Society
			</h1>
			<p class="lede" style="margin-top: 1.2rem;">
				The Normal People Society makes normal things, and it makes pictures, under one rule.
			</p>
		</div>
	</section>

	<section class="section" id="why">
		<div class="wrap article">
			<p class="eyebrow">Why normal</p>
			<p class="lede">
				No app, no wifi, no location sharing. The thing does the job. It does not report where you are. It does not
				need a phone.
			</p>
			<p class="lede" style="margin-top: 1.2rem;">
				<a href="/contact">Contact</a>
				{' · '}
				<a href="/#notify">Notify</a>
				{' · '}
				<a href={brand.social.x} target="_blank" rel="noreferrer">X</a>
			</p>
		</div>
	</section>
</Layout>
```

- [ ] **Step 3: Verify**

`/watch`, `/watch#films`, `/watch#television`, `/about`, `/about#why`. Hero pill now lands on `#why`. Watch mega children jump to the sections.

- [ ] **Step 4: Commit**

```bash
git add src/pages/watch.astro src/pages/about.astro
git commit -m "feat: add watch slate and about pages"
```

---

### Task 8: Site forms

**Files:**
- Create: `src/lib/forms.ts`
- Test: `src/lib/forms.test.ts`
- Create: `src/components/react/NotifyForm.tsx`
- Create: `src/components/react/ContactForm.tsx`
- Create: `src/pages/contact.astro`
- Modify: `src/pages/index.astro`, `dishwasher.astro`, `washing-machine.astro`, `litter-box.astro`, `watch.astro` — replace notify placeholders with `<NotifyForm client:load interest="…" />`

**Interfaces:**
- Consumes: `apiUrl`, `listIsLive` from `src/lib/api.ts`; `Interest`, `ContactTopic`, `CONTACT_TOPICS`, `brand`
- Produces:
  - `subscribeBody(email: string, website: string, turnstileToken: string, interest: Interest)`
  - `contactBody(input: { name: string; email: string; topic: ContactTopic; message: string; website: string; turnstileToken: string })`
  - `<NotifyForm interest: Interest />`
  - `<ContactForm />`
  - Locked error `The list is not live yet. Write hello@thenormal.space.` when `!listIsLive()`

- [ ] **Step 1: Write the failing form tests**

`src/lib/forms.test.ts`:

```ts
import { expect, test } from "bun:test";
import { contactBody, subscribeBody } from "./forms";

test("subscribeBody sends email, honeypot, token, and interest", () => {
  expect(subscribeBody("a@b.c", "", "tok", "dishwasher")).toEqual({
    email: "a@b.c",
    website: "",
    turnstileToken: "tok",
    interest: "dishwasher",
  });
});

test("contactBody sends name, email, topic, message, honeypot, and token", () => {
  expect(
    contactBody({
      name: "Ada",
      email: "ada@lab.org",
      topic: "things",
      message: "About the dishwasher.",
      website: "",
      turnstileToken: "tok",
    }),
  ).toEqual({
    name: "Ada",
    email: "ada@lab.org",
    topic: "things",
    message: "About the dishwasher.",
    website: "",
    turnstileToken: "tok",
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun test src/lib/forms.test.ts`

Expected: FAIL — `Cannot find module './forms'`.

- [ ] **Step 3: Implement helpers**

`src/lib/forms.ts`:

```ts
import type { ContactTopic, Interest } from "../data/site";

export function subscribeBody(
  email: string,
  website: string,
  turnstileToken: string,
  interest: Interest,
) {
  return { email, website, turnstileToken, interest };
}

export function contactBody(input: {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  website: string;
  turnstileToken: string;
}) {
  return input;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test src/lib/forms.test.ts`

Expected: PASS.

- [ ] **Step 5: Write NotifyForm**

`src/components/react/NotifyForm.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Interest } from "../../data/site";
import { apiUrl, listIsLive } from "../../lib/api";
import { subscribeBody } from "../../lib/forms";

const LIST_DOWN = "The list is not live yet. Write hello@thenormal.space.";

type TurnstileAPI = {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => void;
};

export default function NotifyForm({ interest }: { interest: Interest }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef("");

  useEffect(() => {
    if (!listIsLive()) return;
    if (!document.getElementById("cf-turnstile")) {
      const script = document.createElement("script");
      script.id = "cf-turnstile";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      document.head.appendChild(script);
    }
    const id = window.setInterval(() => {
      const turnstile = (window as unknown as { turnstile?: TurnstileAPI }).turnstile;
      const el = widgetRef.current;
      if (!turnstile || !el || el.dataset.rendered) return;
      el.dataset.rendered = "true";
      turnstile.render(el, {
        sitekey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
        callback: (token: string) => {
          tokenRef.current = token;
        },
      });
      window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!listIsLive()) {
      setError(LIST_DOWN);
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter an email we can write back to.");
      return;
    }
    if (!tokenRef.current) {
      setError("Could not verify this request.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/list/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscribeBody(email.trim(), website, tokenRef.current, interest)),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || LIST_DOWN);
      setDone(true);
    } catch {
      setError(LIST_DOWN);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <div className="notice">Check your mail. Confirm the address.</div>;
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="footer-honeypot" aria-hidden="true">
        <label>
          Website
          <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="field">
        <span>Email</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      </label>
      {listIsLive() ? <div ref={widgetRef} className="cf-turnstile" /> : null}
      {error ? <div className="notice">{error}</div> : null}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Notify me"}
        </button>
      </div>
    </form>
  );
}
```

If `response.ok` is false and `payload.error` is exactly `Enter an email we can write back to.` or `Could not verify this request.`, show that string. Every other failure, including network errors, shows `LIST_DOWN`.

- [ ] **Step 6: Write ContactForm and `/contact`**

`src/components/react/ContactForm.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ContactTopic } from "../../data/site";
import { apiUrl, listIsLive } from "../../lib/api";
import { contactBody } from "../../lib/forms";

const LIST_DOWN = "The list is not live yet. Write hello@thenormal.space.";

type TurnstileAPI = {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => void;
};

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<ContactTopic>("things");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef("");

  useEffect(() => {
    if (!listIsLive()) return;
    if (!document.getElementById("cf-turnstile")) {
      const script = document.createElement("script");
      script.id = "cf-turnstile";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      document.head.appendChild(script);
    }
    const id = window.setInterval(() => {
      const turnstile = (window as unknown as { turnstile?: TurnstileAPI }).turnstile;
      const el = widgetRef.current;
      if (!turnstile || !el || el.dataset.rendered) return;
      el.dataset.rendered = "true";
      turnstile.render(el, {
        sitekey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
        callback: (token: string) => {
          tokenRef.current = token;
        },
      });
      window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!listIsLive()) {
      setError(LIST_DOWN);
      return;
    }
    if (!tokenRef.current) {
      setError("Could not verify this request.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          contactBody({
            name,
            email,
            topic,
            message,
            website,
            turnstileToken: tokenRef.current,
          }),
        ),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || LIST_DOWN);
      setDone(true);
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : LIST_DOWN;
      setError(text === "Could not send this note." ? text : LIST_DOWN);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="notice">
        We received it. We will write back to the address you gave.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="footer-honeypot" aria-hidden="true">
        <label>
          Website
          <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      </label>
      <label className="field">
        <span>Topic</span>
        <select value={topic} onChange={(event) => setTopic(event.target.value as ContactTopic)}>
          <option value="things">Things</option>
          <option value="watch">Watch</option>
          <option value="press">Press</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="field">
        <span>Message</span>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} required minLength={12} />
      </label>
      {listIsLive() ? <div ref={widgetRef} className="cf-turnstile" /> : null}
      {error ? <div className="notice">{error}</div> : null}
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
```

`src/pages/contact.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
import ContactForm from '../components/react/ContactForm';
---

<Layout title="Contact" description="Write to The Normal People Society.">
	<section class="page section">
		<div class="wrap article">
			<p class="eyebrow">Contact</p>
			<h1 class="display" style="font-size: clamp(2.6rem, 7vw, 5.4rem);">Write to us.</h1>
			<ContactForm client:load />
		</div>
	</section>
</Layout>
```

- [ ] **Step 7: Mount NotifyForm**

Replace every `data-notify-slot` / `data-notify-interest` placeholder:

- Home `#notify`: `<NotifyForm client:load interest="all" />`
- Product pages: `interest={product.interest}`
- Watch cards: one form per section, not per card — under the films list `<NotifyForm client:load interest="films" />`, under television `<NotifyForm client:load interest="television" />`. Remove the per-card “Notify” placeholder text.

- [ ] **Step 8: Verify forms without an API**

With `PUBLIC_API_URL` unset, submit Notify on `/` and Contact on `/contact`. Both must show `The list is not live yet. Write hello@thenormal.space.` and must not look successful.

- [ ] **Step 9: Commit**

```bash
git add src/lib/forms.ts src/lib/forms.test.ts src/components/react/NotifyForm.tsx src/components/react/ContactForm.tsx src/pages/contact.astro src/pages/index.astro src/pages/dishwasher.astro src/pages/washing-machine.astro src/pages/litter-box.astro src/pages/watch.astro
git commit -m "feat: add notify and contact forms that fail honestly"
```

---

### Task 9: Waitlist API

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/wrangler.jsonc`, `api/migrations/0001_subscribers.sql`
- Create: `api/src/schemas.ts`, `cors.ts`, `security.ts`, `turnstile.ts`, `list.ts`, `contact.ts`, `index.ts`
- Create: `api/test/env.ts`, `schemas.test.ts`, `list.test.ts`, `contact.test.ts`
- Do not create Stripe routes.

**Interfaces:**
- Consumes: `Interest`, `INTERESTS`, `ContactTopic`, `CONTACT_TOPICS` from `../../shared/catalog.ts` (do not re-declare the literals)
- Produces:
  - `parseSubscribe(body: unknown)` → `{ email, website, turnstileToken, interest }`
  - `parseContact(body: unknown)` → `{ name, email, topic, message, website, turnstileToken }` with topics `things | watch | press | other`
  - `POST /list/subscribe`, `GET /list/confirm`, `GET|POST /list/unsubscribe`, `OPTIONS|POST /contact`
  - Unknown routes: `404 { error: "Not found." }`
  - Redirects: `{SITE_URL}/?notify=confirmed|missing|unsubscribed`

- [ ] **Step 1: Scaffold `api/` package**

`api/package.json`:

```json
{
  "name": "thenormal-space-api",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --config wrangler.jsonc --port 8787",
    "types": "wrangler types --config wrangler.jsonc",
    "test": "bun test test"
  },
  "dependencies": {
    "hono": "^4.13.1"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14",
    "typescript": "^5.9.0",
    "wrangler": "^4.123.0"
  }
}
```

`api/tsconfig.json` — same as Foundation api (strict, types bun + `./worker-configuration.d.ts`). After the first `wrangler types` you will have that file; until then add a stub:

```ts
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
    EMAIL: { send(message: unknown): Promise<void> };
  }
}
```

`api/wrangler.jsonc`:

```jsonc
{
  "name": "thenormal-space-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-14",
  "compatibility_flags": ["nodejs_compat"],
  "vars": {
    "SITE_URL": "https://thenormal.space",
    "MAIL_FROM": "hello@thenormal.space",
    "CONTACT_TO": "hello@thenormal.space",
    "CONTACT_FROM": "hello@thenormal.space"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "thenormal-list",
      "database_id": "REPLACE_WHEN_PROVISIONED",
      "migrations_dir": "migrations"
    }
  ]
}
```

Do not invent a real `database_id`. Leave the placeholder; tests inject a memory DB.

`api/migrations/0001_subscribers.sql`:

```sql
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  confirm_token TEXT UNIQUE,
  unsub_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT
);

CREATE TABLE IF NOT EXISTS subscriber_interests (
  subscriber_id TEXT NOT NULL,
  interest TEXT NOT NULL,
  PRIMARY KEY (subscriber_id, interest),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_confirm ON subscribers(confirm_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_unsub ON subscribers(unsub_token);
```

`cd api && bun install`

- [ ] **Step 2: Write failing schema tests**

`api/src/schemas.ts` may be empty or missing. Tests:

```ts
import { describe, expect, test } from "bun:test";
import { parseContact, parseSubscribe } from "../src/schemas";

describe("parseSubscribe", () => {
  test("normalizes email and keeps interest", () => {
    expect(
      parseSubscribe({
        email: "  A@B.C  ",
        website: "",
        turnstileToken: "tok",
        interest: "dishwasher",
      }),
    ).toEqual({
      ok: true,
      value: { email: "a@b.c", website: "", turnstileToken: "tok", interest: "dishwasher" },
    });
  });

  test("rejects missing token, bad email, and bad interest", () => {
    expect(parseSubscribe({ email: "a@b.c", interest: "all" })).toEqual({
      ok: false,
      error: "Could not verify this request.",
    });
    expect(parseSubscribe({ email: "nope", turnstileToken: "tok", interest: "all" })).toEqual({
      ok: false,
      error: "Enter an email we can write back to.",
    });
    expect(parseSubscribe({ email: "a@b.c", turnstileToken: "tok", interest: "toaster" })).toEqual({
      ok: false,
      error: "Choose what you want a note about.",
    });
  });
});

describe("parseContact", () => {
  const good = {
    name: "Ada",
    email: "  Ada@Lab.org  ",
    topic: "things",
    message: "I want a dishwasher that is just a dishwasher.",
    turnstileToken: "tok",
  };

  test("normalizes email and accepts things topic", () => {
    expect(parseContact({ ...good, website: "" })).toEqual({
      ok: true,
      value: {
        name: "Ada",
        email: "ada@lab.org",
        topic: "things",
        message: "I want a dishwasher that is just a dishwasher.",
        website: "",
        turnstileToken: "tok",
      },
    });
  });

  test("rejects grants topic and short name", () => {
    expect(parseContact({ ...good, topic: "grants" })).toEqual({
      ok: false,
      error: "Choose a topic.",
    });
    expect(parseContact({ ...good, name: "A" })).toEqual({
      ok: false,
      error: "Enter a name.",
    });
  });
});
```

Run: `cd api && bun test test/schemas.test.ts` — FAIL.

- [ ] **Step 3: Implement schemas**

Copy Foundation `EMAIL_RE` and `parseSubscribe` / `parseContact`, then import `INTERESTS` and `CONTACT_TOPICS` from `../../shared/catalog.ts`. Missing or unknown interest → error `Choose what you want a note about.` Unknown topic → `Choose a topic.`

- [ ] **Step 4: Run schema tests — PASS**

- [ ] **Step 5: Write security, cors, turnstile, test env**

`api/src/cors.ts`:

```ts
export const PRODUCTION_ORIGINS = [
  "https://thenormal.space",
  "https://www.thenormal.space",
] as const;

export const DEV_ORIGINS = ["http://localhost:4321", "http://127.0.0.1:4321"] as const;

export function allowedOrigin(origin: string, allowDev: boolean): string {
  if ((PRODUCTION_ORIGINS as readonly string[]).includes(origin)) return origin;
  if (allowDev && (DEV_ORIGINS as readonly string[]).includes(origin)) return origin;
  return "";
}
```

`api/src/turnstile.ts` — copy Foundation `verifyTurnstile` unchanged.

`api/src/security.ts` — copy Foundation, then:

- `APEX` unused for redirects. Replace `denyToApex` with:

```ts
export function denyNotFound(c: Context): Response {
  logSecurity(c, "not_allowlisted");
  return c.json({ error: "Not found." }, 404);
}
```

- `ALLOWED` set:

```
OPTIONS /list/subscribe
POST /list/subscribe
GET /list/confirm
GET /list/unsubscribe
POST /list/unsubscribe
OPTIONS /contact
POST /contact
```

No give routes. `MAX_JSON_BYTES = 4096`. Keep `formCors`, `readLimitedText`, `applySecurityHeaders`.

`api/test/env.ts` — start from Foundation’s memory DB and extend it:

```ts
type Subscriber = {
  id: string;
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  confirm_token: string | null;
  unsub_token: string;
};

type InterestRow = { subscriber_id: string; interest: string };

export function createMemoryDb(seed: Subscriber[] = [], interests: InterestRow[] = []) {
  const rows = [...seed];
  const interestRows = [...interests];
  // prepare() branches:
  // SELECT ... FROM subscribers WHERE email|confirm_token|unsub_token
  // SELECT interest FROM subscriber_interests WHERE subscriber_id
  // INSERT INTO subscribers
  // INSERT INTO subscriber_interests
  // UPDATE ... pending | confirmed | unsubscribed
}
```

`createTestEnv` defaults:

```
SITE_URL: "https://thenormal.space"
MAIL_FROM / CONTACT_TO / CONTACT_FROM: "hello@thenormal.space"
TURNSTILE_SECRET: "1x0000000000000000000000000000000AA"
```

Keep `stubTurnstile` from Foundation.

- [ ] **Step 6: Write failing list + contact tests**

`api/test/list.test.ts` must cover:

1. Honeypot → 200 `{ ok: true }`, no row, no mail
2. New email + `interest: "dishwasher"` → pending row, interest attached, confirm mail subject `Confirm you want notes from The Normal Space.`
3. Same email, new interest `films` while pending → still pending, both interests, confirm mail resent
4. Confirmed email, new interest → interest attached, subject `You are on this list too.`
5. Confirmed email, same interest → 200, no new mail
6. Unsubscribed email → pending again, new confirm token, confirm mail
7. `GET /list/confirm` missing token → 302 `https://thenormal.space/?notify=missing`
8. `GET /list/confirm?token=` matching pending → confirmed, 302 `/?notify=confirmed`, welcome subject `You are on the list.`
9. `GET /list/unsubscribe` missing token → 302 `/?notify=missing`

`api/test/contact.test.ts`:

1. OPTIONS `/contact` is CORS for `https://thenormal.space`, not 302
2. GET `/contact` is 404 `{ error: "Not found." }`
3. Missing Turnstile → 403
4. Honeypot → 200, no send
5. Valid `topic: "things"` → send to `hello@thenormal.space`, from `hello@thenormal.space`, replyTo visitor, subject `Contact · things · Ada`
6. Mail throw → 503 `{ error: "Could not send this note." }`

Run them — FAIL (no app).

- [ ] **Step 7: Implement list, contact, index**

`api/src/list.ts` — Foundation list flow plus interests:

```ts
// After parseSubscribe + turnstile:
if (parsed.value.website.trim()) return c.json({ ok: true });

const existing = await env.DB.prepare(
  "SELECT id, status, confirm_token, unsub_token FROM subscribers WHERE email = ?",
).bind(email).first<...>();

const currentInterests = existing
  ? await env.DB.prepare("SELECT interest FROM subscriber_interests WHERE subscriber_id = ?")
      .bind(existing.id)
      .all<{ interest: string }>()
  : { results: [] };

const hasInterest = currentInterests.results.some((row) => row.interest === interest);

// new → insert pending + interest + confirm mail
// pending → insert interest if needed + resend confirm (reuse confirm_token)
// confirmed + !hasInterest → insert interest + "You are on this list too."
// confirmed + hasInterest → { ok: true }, no mail
// unsubscribed → status pending, new confirm_token, insert interest, confirm mail
```

Confirm / unsubscribe redirects use `notify=` not `briefs=`.

`sendMail` from-name: `The Normal Space`. Swallow send errors to console (same as Foundation subscribe — subscribe still returns `{ ok: true }` after a send attempt). Contact does **not** swallow: 503.

`api/src/contact.ts` — Foundation contact with The Normal Space from/to defaults and topics already validated by `parseContact`.

`api/src/index.ts`:

```ts
const app = new Hono<{ Bindings: Cloudflare.Env }>();
app.onError(...);
app.use("*", applySecurityHeaders);
app.use("/list/subscribe", formCors...);
app.use("/contact", formCors...);
app.route("/list", list);
app.route("/", contact);
app.notFound((c) => denyNotFound(c));
export default app;
```

- [ ] **Step 8: Run API tests — PASS**

Run: `cd api && bun test test`

Expected: all schema, list, and contact tests PASS.

- [ ] **Step 9: Commit**

```bash
git add api
git commit -m "feat: add waitlist and contact API with interests"
```

---

## Spec coverage

| Spec section | Task |
| --- | --- |
| Brand / lockup / X / email | 1 |
| Visual tokens, fonts, dark only | 2 |
| Header port, no theme, megas | 3 |
| Footer + stacked wordmark + 404 | 4 |
| Home hero, things, watch hint, notify band, `?notify=` | 5, 8 |
| Product pages + three facts | 6 |
| Watch slate titles + About / why | 7 |
| Notify + Contact forms + honest empty API | 8 |
| API subscribe/confirm/unsub/contact + interests | 9 |
| No checkout / CMS / light theme / legal | omitted on purpose |

## Self-review notes

- `subscribeBody` gains `interest` relative to Foundation — site and API both use that four-field body.
- `Interest` / `ContactTopic` live in `shared/catalog.ts`. Site re-exports; API imports. Do not duplicate the literal arrays.
- `MegaId` is `"things" | "watch" | "about"` in `src/data/site.ts` and the store.
- Confirm redirects are `notify=`, never `briefs=`.
- Unknown API routes are 404 JSON, never a 302 to Foundation.
- Header `groupCurrent` is required so `/washing-machine` marks Things current (`group.href` is `/dishwasher`).

---
