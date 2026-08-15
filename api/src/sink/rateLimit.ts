import { SINK_RATE_PER_MINUTE } from "./schema";

type LimitKv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export async function overRateLimit(kv: LimitKv | undefined, siteId: string, ip: string): Promise<boolean> {
  if (!kv || !ip) return false;
  try {
    const key = `rl:${siteId}:${ip}`;
    const raw = await kv.get(key);
    const n = raw ? Number(raw) : 0;
    const next = Number.isFinite(n) ? n + 1 : 1;
    await kv.put(key, String(next), { expirationTtl: 60 });
    return next > SINK_RATE_PER_MINUTE;
  } catch {
    return false;
  }
}
