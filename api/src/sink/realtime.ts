import { DurableObject } from "cloudflare:workers";

const LIVE_MS = 5 * 60 * 1000;

type LiveEnv = {
  REALTIME?: DurableObjectNamespace<Realtime>;
};

export class Realtime extends DurableObject<LiveEnv> {
  constructor(ctx: DurableObjectState, env: LiveEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS live (
          visitor TEXT PRIMARY KEY,
          session TEXT NOT NULL,
          seen INTEGER NOT NULL
        )
      `);
    });
  }

  async ping(visitor: string, session: string): Promise<void> {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO live (visitor, session, seen) VALUES (?, ?, ?) ON CONFLICT(visitor) DO UPDATE SET session = excluded.session, seen = excluded.seen",
      visitor,
      session,
      now,
    );
    this.ctx.storage.sql.exec("DELETE FROM live WHERE seen < ?", now - LIVE_MS);
    await this.ctx.storage.setAlarm(now + 60_000);
  }

  async snapshot(): Promise<{ visitors: number; sessions: number }> {
    const now = Date.now();
    this.ctx.storage.sql.exec("DELETE FROM live WHERE seen < ?", now - LIVE_MS);
    const visitors = this.ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM live").one();
    const sessions = this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(DISTINCT session) AS n FROM live")
      .one();
    return { visitors: visitors?.n ?? 0, sessions: sessions?.n ?? 0 };
  }

  async alarm(): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM live WHERE seen < ?", Date.now() - LIVE_MS);
    const left = this.ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM live").one();
    if ((left?.n ?? 0) > 0) await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }
}
