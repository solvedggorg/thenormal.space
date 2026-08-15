# The Normal Space — site design

Date: 2026-08-14

Status: draft for review

Build the first public site for The Normal Space: a dark, quiet marketing site that borrows the AWFixer Foundation header and the x.ai / Vercel hero language, and sells a single idea — we make *normal* things. No app, no wifi, no location sharing.

## Goal

A visitor lands on a full-viewport hero that states the pitch, can join a waitlist, and can reach three product pages, a film/TV slate, About, and Contact. Nothing is for sale. There is no cart, no CMS, and no theme toggle.

## Brand

| Field | Value |
| --- | --- |
| Site name | The Normal Space |
| Corporate name | The Normal People Society (no “Inc.”) |
| Domain | thenormal.space |
| X | [@thenormalcorp](https://x.com/thenormalcorp) |
| Public email | hello@thenormal.space |
| Voice | Literal, short, unpoetic. Name the object. Do not sell. |

Software is a principle, not a product line. Every thing on this site refuses an app, wifi, and location sharing. That sentence appears on the home hero and on every product page. It is not a nav group.

## Decisions

| Decision | Choice |
| --- | --- |
| Stack | Existing Astro 7 + React + Cloudflare adapter in this repo |
| Header | Port Foundation `Header.tsx` behavior and CSS; swap content; drop theme toggle |
| Surface | Dark only. No light theme, no `data-theme`, no ●/○ control |
| Hero | Full initial viewport (`100svh`), nav floats over it, centered x.ai composition |
| Commerce | None. Notify / inquire only |
| Catalog | Dishwasher, Washing Machine, Litter Box |
| Watch | Placeholder slate, all forthcoming |
| Waitlist | Sibling `api/` worker, Foundation list/contact shape, plus an `interest` tag |
| Fonts | Foundation files: Sora 600, Figtree 400/500/600, IBM Plex Mono 400/500 |
| Decorative mark | None in the hero. No temple glyph. Footer may use a stacked “normal” wordmark |

## Visual system

Near-black field, warm off-white type, hairlines. No accent color. No orange NEW chip.

| Token | Hex / value | Role |
| --- | --- | --- |
| `--bg` | `#070707` | Page |
| `--bg-wash` | `#111110` | Cards, panels |
| `--ink` | `#F2F0EA` | Primary type |
| `--ink-soft` | `#C4C1B8` | Subcopy |
| `--muted` | `#8A8882` | Kickers, meta |
| `--line` | `rgba(242, 240, 234, 0.12)` | Hairlines |
| `--line-strong` | `rgba(242, 240, 234, 0.22)` | Hover borders, ghost buttons |
| `--card` | `#111110` | Surfaces |
| `--invert` | `#F2F0EA` | Solid buttons |
| `--invert-ink` | `#070707` | Type on solid buttons |
| `--halo` | `rgba(242, 240, 234, 0.06)` | Mega shadow, hover wash |
| `--radius` | `12px` | Cards, panels |
| `--radius-pill` | `999px` | Buttons, banner, CTAs |
| `--font-display` | Sora | Headlines, brand, mobile nav |
| `--font-body` | Figtree | Body, nav triggers |
| `--font-mono` | IBM Plex Mono | Kickers, byline, interest labels |
| `--header` | `80px` | Header height at rest |
| `--max` | `1180px` | Content measure |
| `--pad` | `clamp(1.15rem, 3.6vw, 2.4rem)` | Page gutter |

Display type: weight 600, letter-spacing about `-0.048em`, line-height about `0.92`. Body: 17px, line-height 1.55, letter-spacing `-0.011em`.

Buttons are pills. Primary is invert fill. Ghost is hairline. Hover lifts 1px. Keyboard focus is a 2px ink ring.

Respect `prefers-reduced-motion`: skip line-reveal and springs; show final state.

## Information architecture

### Header lockup

- Mark: none. Type only.
- Name: `The Normal Space`
- Byline: `by The Normal People Society`

### Nav groups

Same mega-menu chrome as Foundation (hover/focus desktop panel, chevron, icon + name + one-line description; mobile accordion).

Nav icons are a closed set: `droplets`, `wash`, `box`, `eye`, `newspaper`, `info`, `list`, `mail`. Map them to Lucide in `Header.tsx`. Do not keep Foundation’s unused icons.

**Things** → `/dishwasher` (landing of the group)

| Child | Href | Description | Icon |
| --- | --- | --- | --- |
| Dishwasher | `/dishwasher` | Washes dishes. You put them in, you take them out. | droplets (`Droplets`) |
| Washing Machine | `/washing-machine` | Washes clothes. Same idea. | wash (`WashingMachine`) |
| Litter Box | `/litter-box` | Holds litter. You scoop it. | box (`Box`) |

**Watch** → `/watch`

| Child | Href | Description | Icon |
| --- | --- | --- | --- |
| Films | `/watch#films` | Pictures. Forthcoming. | eye |
| Television | `/watch#television` | Episodes. Forthcoming. | newspaper |

**About** → `/about`

| Child | Href | Description | Icon |
| --- | --- | --- | --- |
| The Society | `/about` | The Normal People Society | info |
| Why normal | `/about#why` | No app, no wifi, no location | list |
| Contact | `/contact` | Things, watch, press, other | mail |

No extra top-level text links (Foundation’s “News” has no counterpart).

Right side:

- Ghost: `Contact` → `/contact`
- Solid CTA: `Notify` → `/#notify` (from inner pages this is a real navigation to `/#notify`)

No theme button. Mobile menu keeps Contact + Notify in the footer of the panel. No “Use light theme” row.

### Routes

| Path | Page |
| --- | --- |
| `/` | Home: hero, things, watch hint, notify |
| `/dishwasher` | Product |
| `/washing-machine` | Product |
| `/litter-box` | Product |
| `/watch` | Slate (films + television) |
| `/about` | Society + why |
| `/contact` | Contact form |
| (unmatched) | Quiet 404 inside the same layout |

No legal, news, shop, or method routes in this pass.

### Footer

Four columns: Things, Watch, About, Society.

Society links: Contact, X (`@thenormalcorp`, external), Notify (`/#notify`).

Bottom: `© {year} The Normal People Society.` plus an X glyph. Include the stacked “normal” wordmark behind the footer, Foundation-style, recolored for the dark field. No EIN, no donate pill.

## Home

### Hero

Occupies the first viewport: `min-height: 100svh`. The fixed header overlays it. Content is centered both axes. No illustration.

1. Pill, links to `/about#why`: `No app · No wifi · No location`
2. Headline, three lines if needed, display size in the Foundation hero range (`clamp(3.3rem, 11vw, 7.6rem)`), max ~14ch:

   **Normal** things for everything you want to do.

   “Normal” is underlined (1px, currentColor, slight offset). That is the only decorative type treatment.
3. Subcopy: `No app, no wifi, no location sharing. Functional, quiet.`
4. Buttons: `Notify me` → `#notify` (primary). `See the things` → `#things` (ghost).

Line-reveal the headline the way Foundation does (`lineReveal`, reduced-motion off). Fade the pill, subcopy, and buttons in after.

### Below the fold

`#things` — three cards, one per product. Literal name, the one-sentence description from the nav, link to the product page. No prices. No photos and no empty frames.

`#watch` — short kicker + two films and two shows as compact rows. Link “All of it” → `/watch`.

`#notify` — waitlist. Email + Turnstile + honeypot. Interest defaults to `all`. Success: `Check your mail. Confirm the address.` Failure if `PUBLIC_API_URL` is unset or the worker errors: `The list is not live yet. Write hello@thenormal.space.` Never show a fake confirmation.

## Product pages

Shared template. Not a spec sheet.

- Kicker: `Thing`
- Display title: the literal name
- Three facts, always in this order: `No app.` `No wifi.` `No location sharing.`
- One paragraph, voice as locked:

  - Dishwasher — washes dishes. You put them in, you take them out.
  - Washing Machine — washes clothes. Same idea.
  - Litter Box — holds litter. You scoop it. That is the product.

- Notify form, interest = that product’s slug (`dishwasher` | `washing-machine` | `litter-box`)

No materials, FAQ, dimensions, or price blocks.

## Watch

Kicker: `Forthcoming`. Lede: we make pictures under the same rule.

`#films`

| Title | Logline |
| --- | --- |
| Tuesday | A day. Nothing else is scheduled. |
| The Drive Home | Two people in a car. The radio works. |

`#television`

| Title | Logline |
| --- | --- |
| Ordinary Time | A season of weeks. No twist. |
| Neighbors | The people next door, left alone. |

Each card: title, `Film` or `Television`, logline, a `Forthcoming` label, Notify (interest `films` or `television`). No trailers, no cast, no dates.

## About

`#` top: The Normal People Society makes normal things, and it makes pictures, under one rule.

`#why`: No app, no wifi, no location sharing. The thing does the job. It does not report where you are. It does not need a phone.

Link to Contact and Notify. Link to X.

## Contact

Same shape as Foundation’s contact form.

Fields: name, email, topic (`things` | `watch` | `press` | `other`), message, Turnstile, honeypot.

Success: `We received it. We will write back to the address you gave.`

## Header behavior (port, do not redesign)

Copy from `../awfixer.foundation`:

- Fixed header, `--h-t` progress from scroll (0 at top → 1 after ~70px), glass bar, shrink height 80→56, inset, radius, max-width tighten
- Desktop megas: spring in, delay-stagger children, 140ms close grace
- Escape closes, resize ≥981px closes mobile
- Body scroll lock while mobile is open
- `aria-current="page"` on the matching trigger
- Skip link to `#main`

Delete only: theme toggle, theme persist, any Foundation-specific store fields (work/problems/give/contact drafts).

Store: `{ navOpen, mega, setNavOpen, setMega }`. Persist nothing.

## API

New sibling worker at `api/`, modeled on `awfixer.foundation/api`. Public origin planned as `api.thenormal.space` once DNS exists. Local: wrangler dev.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/list/subscribe` | Start or update a subscription |
| GET | `/list/confirm?token=` | Double opt-in; redirect to site |
| GET | `/list/unsubscribe?token=` | One-click unsub; redirect |
| POST | `/list/unsubscribe?token=` | List-Unsubscribe=One-Click |
| OPTIONS, POST | `/contact` | Intake mail |

Unknown routes: 404 JSON `{ error }`, not a 302 to the foundation apex.

### Subscribe body

- `email`: trimmed, lowercased, max 254, existing Foundation email regex
- `website`: honeypot, optional
- `turnstileToken`: non-empty
- `interest`: `all` \| `dishwasher` \| `washing-machine` \| `litter-box` \| `films` \| `television`

If honeypot is non-empty: `{ ok: true }`, no write, no mail.

### Subscriber model

One row per email. Many interests.

```
subscribers (
  id, email UNIQUE NOCASE, status CHECK (pending|confirmed|unsubscribed),
  confirm_token UNIQUE, unsub_token UNIQUE NOT NULL,
  created_at, confirmed_at, unsubscribed_at
)

subscriber_interests (
  subscriber_id, interest,
  PRIMARY KEY (subscriber_id, interest)
)
```

Rules:

- New email → insert pending, attach interest, send confirm mail.
- Existing pending → attach interest if new, resend confirm (same token if still valid).
- Existing confirmed → attach interest if new, do not send a second welcome unless this is a new interest; then send a short “you are on this list too” note.
- Existing unsubscribed → set pending, rotate confirm token, attach interest, send confirm.

Confirm mail subject: `Confirm you want notes from The Normal Space.`
Confirmed mail subject: `You are on the list.`
Copy stays as short as the Foundation briefs mail, with this name.

Redirects: `{SITE_URL}/?notify=confirmed|missing|unsubscribed`.

### Contact body

- `name` 2–120
- `email` same regex
- `topic` `things` \| `watch` \| `press` \| `other`
- `message` 12–5000
- `website` honeypot
- `turnstileToken`

Send via Cloudflare Email binding.

- From: `CONTACT_FROM` (`hello@thenormal.space`)
- To: `CONTACT_TO` (`hello@thenormal.space`)
- Reply-To: visitor
- Subject: `Contact · {topic} · {name}`

Honeypot: 200 `{ ok: true }`, no send. Send throw: 503 `{ error: "Could not send this note." }`.

### Abuse floor

Same as Foundation: Turnstile, CORS allowlist of the site origin, 4 KiB JSON cap, honeypot. Document a WAF 5/min/IP rule for subscribe and contact; do not implement WAF in code.

### Site wiring

`PUBLIC_API_URL` (no trailing slash). `PUBLIC_TURNSTILE_SITE_KEY` on the Astro app.

If `PUBLIC_API_URL` is missing, the form does not POST and shows `The list is not live yet. Write hello@thenormal.space.`

`?notify=confirmed|missing|unsubscribed` on `/` renders a one-line status under `#notify`.

## Components and files

Port (trim, re-home):

- `public/fonts/*` (the six woff2 files)
- `src/components/react/Header.tsx`
- Header + primitive rules from `src/styles/global.css` (not explorer/atlas/give)
- `src/lib/motion.ts`
- `src/lib/forms.ts` (+ tests)
- `src/components/Footer.astro` structure, new copy
- `src/components/BrandWordmark.astro` text default `normal`

New:

- `src/styles/global.css` — tokens + header + hero + page primitives only
- `src/layouts/Layout.astro` — dark, no theme boot script, Header + Footer
- `src/components/react/Hero.tsx`
- `src/components/react/NotifyForm.tsx`
- `src/components/react/ContactForm.tsx`
- `src/data/site.ts` — brand, nav, footer
- `src/data/products.ts`
- `src/data/watch.ts`
- `src/pages/{index,dishwasher,washing-machine,litter-box,watch,about,contact,404}.astro`
- `src/lib/api.ts` — `PUBLIC_API_URL`
- `api/` — Hono worker, schemas, list, contact, security, turnstile, tests, D1 migration

Delete the stock Astro `Welcome.astro` and unused Welcome assets once home exists.

Zustand persist key, if any leftover, must not be `awfixer-foundation`. Prefer no persist.

## Errors

| Case | What the person sees |
| --- | --- |
| Bad email / short message | Inline field error, no POST |
| Turnstile missing | `Could not verify this request.` |
| API down / no URL | `The list is not live yet. Write hello@thenormal.space.` |
| Subscribe 200 | `Check your mail. Confirm the address.` |
| Contact 200 | `We received it. We will write back to the address you gave.` |
| `?notify=confirmed` | `You are on the list.` |
| `?notify=unsubscribed` | `You are off the list.` |
| `?notify=missing` | `That link did not work.` |
| 404 | `This page is not here.` + link home |

Do not apologize. Do not be vague.

## Tests

- `src/lib/forms.test.ts` — body builders
- `api/test/schemas.test.ts` — email, interest enum, contact topics, length bounds
- `api/test/list.test.ts` — honeypot, new subscribe, second interest, unsub→resub, confirm redirect
- `api/test/contact.test.ts` — honeypot, send, 503 on throw, topic enum
- `src/data` exports used by Header compile (nav group ids match store `MegaId`)

No visual snapshot tests in this pass.

## Out of scope

Checkout, Stripe, Sanity, news, grants, atlas, theme toggle, i18n, legal pages, product photography, real film titles, deploying DNS / D1 / Email / Turnstile in production (scaffold + documented vars only).

## Implementation order

1. Tokens, fonts, Layout, slim store
2. Header port + `site.ts` nav
3. Footer + 404
4. Home hero + below-the-fold sections
5. Product template + three pages
6. Watch + About + Contact
7. Forms + `api/` worker and tests
8. Wire notify status query + empty-API error path

## Success

- First screen is the dark full-viewport hero with the locked copy
- Header is recognizably the Foundation bar with The Normal Space content and no theme toggle
- Three product pages, Watch slate, About, Contact all resolve
- Notify and Contact POST to the Foundation-shaped API when configured, and fail honestly when not
- Light theme does not exist
