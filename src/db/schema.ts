export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  pubkey       BLOB PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS keys (
  pubkey       BLOB PRIMARY KEY REFERENCES users(pubkey),
  private_key  BLOB NOT NULL,
  is_primary   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at   TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  pubkey        BLOB PRIMARY KEY,
  fingerprint   TEXT UNIQUE NOT NULL,
  nickname      TEXT,
  endpoint_url  TEXT NOT NULL,
  added_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at  TEXT
);
CREATE INDEX IF NOT EXISTS contacts_nickname_idx ON contacts(nickname) WHERE nickname IS NOT NULL;

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  direction      TEXT NOT NULL,                 -- 'in' | 'out'
  from_pubkey    BLOB NOT NULL,
  to_pubkey      BLOB NOT NULL,
  timestamp      TEXT NOT NULL,
  in_reply_to    TEXT,
  body           TEXT NOT NULL,
  envelope       TEXT NOT NULL,
  status         TEXT NOT NULL,
  error          TEXT,
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at   TEXT,
  read_at        TEXT,
  received_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS messages_inbox_idx
  ON messages(direction, read_at, received_at DESC);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(in_reply_to);
`;

export const CURRENT_SCHEMA_VERSION = '1';
