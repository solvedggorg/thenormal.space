import { escapeHtml } from "./security";

export function layout(input: {
  title: string;
  kicker?: string;
  body: string;
  siteKey?: string;
  extraHead?: string;
}): string {
  const kicker = input.kicker
    ? `<p class="kicker">${escapeHtml(input.kicker)}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)} · The Normal Space</title>
  ${input.extraHead || ""}
  <link rel="preload" href="https://thenormal.space/fonts/sora-600.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="https://thenormal.space/fonts/figtree-400.woff2" as="font" type="font/woff2" crossorigin />
  <style>
    @font-face { font-family: Sora; font-style: normal; font-weight: 600; font-display: swap; src: url("https://thenormal.space/fonts/sora-600.woff2") format("woff2"); }
    @font-face { font-family: Figtree; font-style: normal; font-weight: 400; font-display: swap; src: url("https://thenormal.space/fonts/figtree-400.woff2") format("woff2"); }
    @font-face { font-family: Figtree; font-style: normal; font-weight: 500; font-display: swap; src: url("https://thenormal.space/fonts/figtree-500.woff2") format("woff2"); }
    @font-face { font-family: "IBM Plex Mono"; font-style: normal; font-weight: 400; font-display: swap; src: url("https://thenormal.space/fonts/ibm-plex-mono-400.woff2") format("woff2"); }
    :root {
      --bg: #070707; --wash: #111110; --ink: #f2f0ea; --soft: #c4c1b8; --muted: #8a8882;
      --line: rgba(242,240,234,.12); --strong: rgba(242,240,234,.22); --halo: rgba(242,240,234,.06);
      --radius: 12px; --pill: 999px;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: var(--bg); color: var(--ink); font-family: Figtree, system-ui, sans-serif; }
    body { min-height: 100svh; display: grid; place-items: center; padding: 2rem 1.15rem; }
    main { width: min(440px, 100%); }
    .kicker { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 .75rem; }
    h1 { font-family: Sora, system-ui, sans-serif; font-size: clamp(1.8rem, 4vw, 2.4rem); letter-spacing: -.048em; line-height: .96; margin: 0 0 1rem; }
    p { color: var(--soft); line-height: 1.55; margin: 0 0 1.1rem; }
    .card { background: var(--wash); border: 1px solid var(--line); border-radius: var(--radius); padding: 1.25rem; }
    label { display: block; font-size: 13px; color: var(--muted); margin: 0 0 .35rem; }
    input, textarea, select {
      width: 100%; background: #070707; color: var(--ink); border: 1px solid var(--line);
      border-radius: 10px; padding: .75rem .85rem; font: inherit; margin-bottom: .85rem;
    }
    input:focus, textarea:focus, select:focus { outline: 2px solid var(--ink); outline-offset: 2px; }
    .hp { position: absolute; left: -9999px; }
    .row { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .35rem; }
    button, .btn {
      appearance: none; border: 0; cursor: pointer; text-decoration: none; display: inline-flex;
      align-items: center; justify-content: center; min-height: 44px; padding: 0 1.15rem;
      border-radius: var(--pill); font: 500 15px/1 Figtree, system-ui, sans-serif;
    }
    .primary { background: var(--ink); color: #070707; }
    .ghost { background: transparent; color: var(--ink); border: 1px solid var(--strong); }
    button:hover, .btn:hover { transform: translateY(-1px); }
    .err { color: #f2f0ea; border: 1px solid var(--strong); background: var(--halo); padding: .7rem .85rem; border-radius: 10px; margin-bottom: 1rem; }
    .muted { color: var(--muted); font-size: 14px; }
    a { color: var(--ink); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: .65rem .4rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 500; }
    .top { width: min(1040px, 100%); }
    header.bar { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 1.5rem; }
    header.bar a { text-decoration: none; }
    .mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; color: var(--muted); word-break: break-all; }
    .nav { display: flex; gap: 1rem; flex-wrap: wrap; }
    @media (prefers-reduced-motion: reduce) { button:hover, .btn:hover { transform: none; } }
  </style>
</head>
<body>
  <main>
    ${kicker}
    ${input.body}
  </main>
  ${input.siteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ""}
</body>
</html>`;
}

export function adminLayout(input: { title: string; email: string; body: string }): string {
  return layout({
    title: input.title,
    kicker: "Admin",
    body: `
      <div class="top">
        <header class="bar">
          <div>
            <p class="kicker">The Normal Space</p>
            <h1>${escapeHtml(input.title)}</h1>
          </div>
          <div class="muted">${escapeHtml(input.email)}
            <form method="post" action="/logout" style="display:inline;margin-left:.75rem">
              <button class="ghost" type="submit">Sign out</button>
            </form>
          </div>
        </header>
        <nav class="nav" style="margin-bottom:1.4rem">
          <a href="/">Home</a>
          <a href="/users">People</a>
          <a href="/clients">Clients</a>
          <a href="/audit">Log</a>
        </nav>
        ${input.body}
      </div>
    `,
  }).replace("place-items: center;", "place-items: start center;");
}
