CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE site_hosts (
  host TEXT PRIMARY KEY,
  site_id TEXT NOT NULL
);

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  match_type TEXT NOT NULL,
  match_value TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO sites (id, name, created_at) VALUES
  ('tns', 'The Normal Space', '2026-08-14T00:00:00.000Z'),
  ('shop', 'Shop', '2026-08-14T00:00:00.000Z');

INSERT INTO site_hosts (host, site_id) VALUES
  ('thenormal.space', 'tns'),
  ('www.thenormal.space', 'tns'),
  ('shop.thenormal.space', 'shop');
