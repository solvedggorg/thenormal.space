CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  confirm_token TEXT UNIQUE,
  unsub_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT
);

CREATE TABLE IF NOT EXISTS subscriber_interests (
  subscriber_id TEXT NOT NULL,
  interest TEXT NOT NULL,
  PRIMARY KEY (subscriber_id, interest),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_confirm ON subscribers(confirm_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_unsub ON subscribers(unsub_token);
