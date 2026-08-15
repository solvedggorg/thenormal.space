import type { ArchivedEvent } from "./schema";

type SinkEnv = {
  SINK_RAW?: R2Bucket;
};

export async function consumeSink(
  batch: MessageBatch<ArchivedEvent>,
  env: SinkEnv,
): Promise<void> {
  if (!env.SINK_RAW) {
    for (const message of batch.messages) message.ack();
    return;
  }
  const groups = new Map<string, ArchivedEvent[]>();
  for (const message of batch.messages) {
    const body = message.body;
    if (!body || typeof body.siteId !== "string") {
      message.ack();
      continue;
    }
    const when = body.receivedAt ? new Date(body.receivedAt) : new Date();
    const key = objectKey(body.siteId, when);
    const list = groups.get(key) ?? [];
    list.push(body);
    groups.set(key, list);
    message.ack();
  }
  for (const [key, events] of groups) {
    const extra = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
    const existing = await env.SINK_RAW.get(key);
    const prefix = existing ? await existing.text() : "";
    await env.SINK_RAW.put(key, prefix + extra, {
      httpMetadata: { contentType: "application/x-ndjson" },
    });
  }
}

export function objectKey(siteId: string, when: Date): string {
  const y = when.getUTCFullYear();
  const m = String(when.getUTCMonth() + 1).padStart(2, "0");
  const d = String(when.getUTCDate()).padStart(2, "0");
  const h = String(when.getUTCHours()).padStart(2, "0");
  return `raw/site=${siteId}/dt=${y}-${m}-${d}/hour=${h}.jsonl`;
}
