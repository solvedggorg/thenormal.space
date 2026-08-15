export async function verifyTurnstile(input: {
  secret: string;
  token: string;
  remoteip: string;
}): Promise<boolean> {
  if (!input.secret || !input.token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: input.secret,
        response: input.token,
        remoteip: input.remoteip,
      }),
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}
