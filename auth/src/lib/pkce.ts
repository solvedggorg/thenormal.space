import { sha256Bytes, toBase64Url, timingSafeEqual } from "./crypto";

export async function verifyS256(verifier: string, challenge: string): Promise<boolean> {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  if (!/^[A-Za-z0-9._~-]+$/.test(verifier)) return false;
  const computed = toBase64Url(await sha256Bytes(verifier));
  return timingSafeEqual(computed, challenge);
}
