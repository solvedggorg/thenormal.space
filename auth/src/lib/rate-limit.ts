export type RateLimit = {
  take(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; remaining: number }>;
};

export function kvRateLimit(kv: KVNamespace): RateLimit {
  return {
    async take(key, limit, windowSec) {
      const now = Date.now();
      const bucket = `rl:${key}:${Math.floor(now / (windowSec * 1000))}`;
      const raw = await kv.get(bucket);
      const count = raw ? Number(raw) : 0;
      if (count >= limit) return { ok: false, remaining: 0 };
      await kv.put(bucket, String(count + 1), { expirationTtl: windowSec + 5 });
      return { ok: true, remaining: Math.max(0, limit - count - 1) };
    },
  };
}

export function memoryRateLimit(): RateLimit {
  const hits = new Map<string, { n: number; exp: number }>();
  return {
    async take(key, limit, windowSec) {
      const now = Date.now();
      const bucket = `${key}:${Math.floor(now / (windowSec * 1000))}`;
      const cur = hits.get(bucket);
      if (!cur || cur.exp < now) {
        hits.set(bucket, { n: 1, exp: now + windowSec * 1000 });
        return { ok: true, remaining: limit - 1 };
      }
      if (cur.n >= limit) return { ok: false, remaining: 0 };
      cur.n += 1;
      return { ok: true, remaining: limit - cur.n };
    },
  };
}
