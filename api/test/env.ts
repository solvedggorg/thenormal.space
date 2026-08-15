type Subscriber = {
  id: string;
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  confirm_token: string | null;
  unsub_token: string;
};

type InterestRow = { subscriber_id: string; interest: string };

export type MailCall = {
  to: string | string[];
  subject: string;
  from?: { email: string; name?: string };
  replyTo?: string;
};

export function createMemoryDb(seed: Subscriber[] = [], interests: InterestRow[] = []) {
  const rows = [...seed];
  const interestRows = [...interests];

  function find(sql: string, args: unknown[]) {
    if (sql.includes("WHERE email")) return rows.find((row) => row.email === args[0]) ?? null;
    if (sql.includes("WHERE confirm_token")) return rows.find((row) => row.confirm_token === args[0]) ?? null;
    if (sql.includes("WHERE unsub_token")) return rows.find((row) => row.unsub_token === args[0]) ?? null;
    return null;
  }

  return {
    rows,
    interestRows,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              return find(sql, args);
            },
            async all() {
              if (sql.includes("subscriber_interests") && sql.includes("WHERE subscriber_id")) {
                return {
                  results: interestRows
                    .filter((row) => row.subscriber_id === args[0])
                    .map((row) => ({ interest: row.interest })),
                };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes("subscriber_interests")) {
                interestRows.push({
                  subscriber_id: String(args[0]),
                  interest: String(args[1]),
                });
              } else if (sql.startsWith("INSERT")) {
                rows.push({
                  id: String(args[0]),
                  email: String(args[1]),
                  status: "pending",
                  confirm_token: String(args[2]),
                  unsub_token: String(args[3]),
                });
              } else if (sql.includes("status = 'pending'")) {
                const row = rows.find((item) => item.id === args[2]);
                if (row) {
                  row.status = "pending";
                  row.confirm_token = String(args[0]);
                  row.unsub_token = String(args[1]);
                }
              } else if (sql.includes("status = 'confirmed'")) {
                const row = rows.find((item) => item.id === args[1]);
                if (row) {
                  row.status = "confirmed";
                  row.confirm_token = null;
                }
              } else if (sql.includes("status = 'unsubscribed'")) {
                const row = rows.find((item) => item.unsub_token === args[1]);
                if (row) {
                  row.status = "unsubscribed";
                  row.confirm_token = null;
                }
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

export function createMemoryKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === "json") return JSON.parse(value);
      return value;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

export function createMemoryR2() {
  const store = new Map<string, { body: string; contentType?: string }>();
  return {
    store,
    async get(key: string) {
      const object = store.get(key);
      if (!object) return null;
      return {
        body: object.body,
        httpMetadata: { contentType: object.contentType },
        httpEtag: '"test"',
      };
    },
    async put(key: string, _value: unknown, options?: { httpMetadata?: { contentType?: string } }) {
      store.set(key, { body: "ok", contentType: options?.httpMetadata?.contentType });
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

export function createMemoryShopDb() {
  const rows: Array<{ id: string; kind: string; payload: string; created_at: string }> = [];
  return {
    rows,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.startsWith("INSERT")) {
                rows.push({
                  id: String(args[0]),
                  kind: String(args[1]),
                  payload: String(args[2]),
                  created_at: String(args[3]),
                });
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

export function createMemoryQueue() {
  const sent: unknown[] = [];
  return {
    sent,
    async send(body: unknown) {
      sent.push(body);
    },
  };
}

export function createMailSpy() {
  const sent: MailCall[] = [];
  return {
    sent,
    async send(message: MailCall & { text?: string; html?: string }) {
      sent.push({
        to: message.to,
        subject: message.subject,
        from: message.from,
        replyTo: message.replyTo,
      });
    },
  };
}

export function createTestEnv(overrides: Record<string, unknown> = {}) {
  const db = createMemoryDb();
  const mail = createMailSpy();
  return {
    db,
    mail,
    env: {
      SITE_URL: "https://thenormal.space",
      MAIL_FROM: "hello@thenormal.space",
      CONTACT_TO: "hello@thenormal.space",
      CONTACT_FROM: "hello@thenormal.space",
      TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      ALLOW_DEV_ORIGINS: "",
      DB: db,
      SHOP_DB: createMemoryShopDb(),
      SHOP_CACHE: createMemoryKv(),
      MEDIA: createMemoryR2(),
      SHOP_EVENTS: createMemoryQueue(),
      SINK_EVENTS: createMemoryQueue(),
      SINK_CACHE: createMemoryKv(),
      SINK: { writeDataPoint() {} },
      SINK_SALT: "test",
      EMAIL: mail,
      MEDUSA_BACKEND_URL: "",
      MEDUSA_PUBLISHABLE_KEY: "",
      SHOP_WEBHOOK_SECRET: "",
      SHOP_MEDIA_SECRET: "",
      ...overrides,
    } as unknown as Cloudflare.Env,
  };
}

export function stubTurnstile(success: boolean) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("challenges.cloudflare.com/turnstile/v0/siteverify")) {
      return Response.json({ success });
    }
    return original(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

export function captureLogs() {
  const lines: unknown[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args[0]);
  };
  return {
    lines,
    restore() {
      console.log = original;
    },
    parsed() {
      return lines
        .filter((line): line is string => typeof line === "string")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}
