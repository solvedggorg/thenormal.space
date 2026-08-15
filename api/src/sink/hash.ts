export async function hashId(parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join(":"));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return hex(new Uint8Array(buf)).slice(0, 16);
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}
