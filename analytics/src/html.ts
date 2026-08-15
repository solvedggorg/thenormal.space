export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function loginPage(next: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in · Analytics</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="auth">
  <main class="auth-card">
    <p class="eyebrow">The Normal Space</p>
    <h1>Analytics</h1>
    <p>This console uses JumpCloud. Cloudflare Access still sits on the hostname.</p>
    <a class="btn primary" href="/login/jumpcloud?next=${encodeURIComponent(next)}">Continue with JumpCloud</a>
  </main>
</body>
</html>`;
}
