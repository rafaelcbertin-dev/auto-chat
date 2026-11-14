CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  username TEXT,
  name TEXT,
  phone TEXT,
  email TEXT,
  fields TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  last_inbound_at INTEGER,
  UNIQUE (channel, external_id)
);

CREATE TABLE contact_tags (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (contact_id, tag)
);
CREATE INDEX idx_contact_tags_tag ON contact_tags(tag);

CREATE TABLE automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',
  match_mode TEXT NOT NULL DEFAULT 'contains',
  media_id TEXT,
  public_replies TEXT NOT NULL DEFAULT '[]',
  once_per_contact INTEGER NOT NULL DEFAULT 0,
  flow TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  contact_id INTEGER PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  automation_id INTEGER NOT NULL,
  node_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE runs (
  automation_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_runs ON runs(automation_id, contact_id);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  text TEXT,
  meta TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_messages_contact ON messages(contact_id, created_at);

CREATE TABLE processed_events (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
