import { app } from "./index";
import { consumeSink } from "./sink/consume";
import type { ArchivedEvent } from "./sink/schema";

export { Realtime } from "./sink/realtime";

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<{ id: string; kind: string; createdAt: string } | ArchivedEvent>, env: Cloudflare.Env) {
    if (batch.queue === "thenormal-analytics-events") {
      await consumeSink(batch as MessageBatch<ArchivedEvent>, env);
      return;
    }
    for (const message of batch.messages) {
      console.log(JSON.stringify({ level: "info", queue: "thenormal-shop-events", body: message.body }));
      message.ack();
    }
  },
};
