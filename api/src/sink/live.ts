type LiveEnv = {
  REALTIME?: DurableObjectNamespace;
};

export async function pingRealtime(
  env: LiveEnv,
  siteId: string,
  visitor: string,
  session: string,
): Promise<void> {
  if (!env.REALTIME) return;
  try {
    const stub = env.REALTIME.getByName(siteId) as { ping(visitor: string, session: string): Promise<void> };
    await stub.ping(visitor, session);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", source: "realtime", message: String(error) }));
  }
}

export async function liveSnapshot(
  env: LiveEnv,
  siteId: string,
): Promise<{ visitors: number; sessions: number }> {
  if (!env.REALTIME) return { visitors: 0, sessions: 0 };
  const stub = env.REALTIME.getByName(siteId) as {
    snapshot(): Promise<{ visitors: number; sessions: number }>;
  };
  return stub.snapshot();
}
