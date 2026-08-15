import { fromBase64Url, randomBytes, toBase64Url } from "./crypto";

const PERIOD = 30;
const DIGITS = 6;
const WINDOW = 1;

function base32Encode(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) throw new Error("invalid secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function encodeTotpSecret(secret: string): string {
  return toBase64Url(new TextEncoder().encode(secret));
}

export function decodeTotpSecret(stored: string): string {
  return new TextDecoder().decode(fromBase64Url(stored));
}

async function hotp(secret: Uint8Array, counter: number): Promise<number> {
  const data = new Uint8Array(8);
  let n = counter;
  for (let i = 7; i >= 0; i--) {
    data[i] = n & 255;
    n = Math.floor(n / 256);
  }
  const key = await crypto.subtle.importKey("raw", secret.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  const offset = sig[sig.length - 1] & 15;
  const bin =
    ((sig[offset] & 127) << 24) | ((sig[offset + 1] & 255) << 16) | ((sig[offset + 2] & 255) << 8) | (sig[offset + 3] & 255);
  return bin % 10 ** DIGITS;
}

export async function totpAt(secretBase32: string, timeMs = Date.now()): Promise<string> {
  const counter = Math.floor(timeMs / 1000 / PERIOD);
  const code = await hotp(base32Decode(secretBase32), counter);
  return code.toString().padStart(DIGITS, "0");
}

export async function verifyTotp(secretBase32: string, code: string, timeMs = Date.now()): Promise<boolean> {
  const trimmed = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) return false;
  const counter = Math.floor(timeMs / 1000 / PERIOD);
  for (let i = -WINDOW; i <= WINDOW; i++) {
    const expected = (await hotp(base32Decode(secretBase32), counter + i)).toString().padStart(DIGITS, "0");
    if (expected === trimmed) return true;
  }
  return false;
}

export function totpOtpauth(email: string, secret: string, issuer = "The Normal Space"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
