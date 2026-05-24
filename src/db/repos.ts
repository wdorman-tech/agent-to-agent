import type { DB } from './index.js';

// ---------- users ----------

export interface UserRow {
  pubkey: Buffer;
  display_name: string;
  created_at: string;
}

export const usersRepo = (db: DB) => ({
  upsert(pubkey: Buffer, displayName: string): void {
    db.prepare(
      `INSERT INTO users(pubkey, display_name) VALUES(?, ?)
         ON CONFLICT(pubkey) DO UPDATE SET display_name = excluded.display_name`,
    ).run(pubkey, displayName);
  },
  get(pubkey: Buffer): UserRow | undefined {
    return db.prepare('SELECT * FROM users WHERE pubkey = ?').get(pubkey) as UserRow | undefined;
  },
});

// ---------- keys ----------

export interface KeyRow {
  pubkey: Buffer;
  private_key: Buffer; // SEALED
  is_primary: number;
  created_at: string;
  revoked_at: string | null;
}

export const keysRepo = (db: DB) => ({
  insert(row: Pick<KeyRow, 'pubkey' | 'private_key' | 'is_primary'>): void {
    db.prepare(`INSERT INTO keys(pubkey, private_key, is_primary) VALUES(?, ?, ?)`).run(
      row.pubkey,
      row.private_key,
      row.is_primary,
    );
  },
  get(pubkey: Buffer): KeyRow | undefined {
    return db.prepare('SELECT * FROM keys WHERE pubkey = ?').get(pubkey) as KeyRow | undefined;
  },
  primary(): KeyRow | undefined {
    return db
      .prepare(
        `SELECT * FROM keys
           WHERE is_primary = 1 AND revoked_at IS NULL
           ORDER BY created_at DESC LIMIT 1`,
      )
      .get() as KeyRow | undefined;
  },
  demoteAllPrimaries(): void {
    db.prepare('UPDATE keys SET is_primary = 0').run();
  },
  revoke(pubkey: Buffer): void {
    db.prepare(
      `UPDATE keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE pubkey = ?`,
    ).run(pubkey);
  },
});

// ---------- contacts ----------

export interface ContactRow {
  pubkey: Buffer;
  fingerprint: string;
  nickname: string | null;
  endpoint_url: string;
  added_at: string;
  last_seen_at: string | null;
}

export const contactsRepo = (db: DB) => ({
  add(args: {
    pubkey: Buffer;
    fingerprint: string;
    endpointUrl: string;
    nickname?: string | null;
  }): void {
    db.prepare(
      `INSERT INTO contacts(pubkey, fingerprint, nickname, endpoint_url)
         VALUES(?, ?, ?, ?)
         ON CONFLICT(pubkey) DO UPDATE SET
           endpoint_url = excluded.endpoint_url,
           nickname     = COALESCE(excluded.nickname, contacts.nickname)`,
    ).run(args.pubkey, args.fingerprint, args.nickname ?? null, args.endpointUrl);
  },
  byPubkey(pubkey: Buffer): ContactRow | undefined {
    return db.prepare('SELECT * FROM contacts WHERE pubkey = ?').get(pubkey) as
      | ContactRow
      | undefined;
  },
  byFingerprint(fp: string): ContactRow | undefined {
    return db.prepare('SELECT * FROM contacts WHERE fingerprint = ?').get(fp.toLowerCase()) as
      | ContactRow
      | undefined;
  },
  byNickname(nick: string): ContactRow | undefined {
    return db.prepare('SELECT * FROM contacts WHERE nickname = ?').get(nick) as
      | ContactRow
      | undefined;
  },
  list(): ContactRow[] {
    return db.prepare('SELECT * FROM contacts ORDER BY added_at DESC').all() as ContactRow[];
  },
  remove(pubkey: Buffer): void {
    db.prepare('DELETE FROM contacts WHERE pubkey = ?').run(pubkey);
  },
  touchSeen(pubkey: Buffer): void {
    db.prepare(
      `UPDATE contacts SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE pubkey = ?`,
    ).run(pubkey);
  },
});

// ---------- messages ----------

export type MessageDirection = 'in' | 'out';
export type MessageStatus =
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'received'
  | 'rejected_signature'
  | 'rejected_replay'
  | 'rejected_stale'
  | 'rejected_unknown_recipient'
  | 'rejected_not_a_contact';

export interface MessageRow {
  id: string;
  direction: MessageDirection;
  from_pubkey: Buffer;
  to_pubkey: Buffer;
  timestamp: string;
  in_reply_to: string | null;
  body: string;
  envelope: string;
  status: MessageStatus;
  error: string | null;
  delivery_attempts: number;
  last_attempt_at: string | null;
  read_at: string | null;
  received_at: string;
}

export const messagesRepo = (db: DB) => ({
  insert(
    row: Omit<MessageRow, 'received_at' | 'delivery_attempts' | 'last_attempt_at' | 'read_at'>,
  ): void {
    db.prepare(
      `INSERT INTO messages
        (id, direction, from_pubkey, to_pubkey, timestamp, in_reply_to, body, envelope, status, error)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      row.direction,
      row.from_pubkey,
      row.to_pubkey,
      row.timestamp,
      row.in_reply_to,
      row.body,
      row.envelope,
      row.status,
      row.error,
    );
  },
  exists(id: string): boolean {
    return !!(db.prepare('SELECT 1 AS x FROM messages WHERE id = ?').get(id) as
      | { x: number }
      | undefined);
  },
  get(id: string): MessageRow | undefined {
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined;
  },
  updateStatus(id: string, status: MessageStatus, error?: string | null): void {
    db.prepare('UPDATE messages SET status = ?, error = ? WHERE id = ?').run(
      status,
      error ?? null,
      id,
    );
  },
  bumpDelivery(id: string): void {
    db.prepare(
      `UPDATE messages
         SET delivery_attempts = delivery_attempts + 1,
             last_attempt_at   = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`,
    ).run(id);
  },
  inbox(opts: { unreadOnly?: boolean; limit?: number } = {}): MessageRow[] {
    const limit = opts.limit ?? 50;
    if (opts.unreadOnly) {
      return db
        .prepare(
          `SELECT * FROM messages
             WHERE direction = 'in' AND read_at IS NULL
             ORDER BY received_at DESC LIMIT ?`,
        )
        .all(limit) as MessageRow[];
    }
    return db
      .prepare(
        `SELECT * FROM messages
           WHERE direction = 'in'
           ORDER BY received_at DESC LIMIT ?`,
      )
      .all(limit) as MessageRow[];
  },
  outbox(limit = 50): MessageRow[] {
    return db
      .prepare(
        `SELECT * FROM messages
           WHERE direction = 'out'
           ORDER BY received_at DESC LIMIT ?`,
      )
      .all(limit) as MessageRow[];
  },
  markRead(id: string): void {
    db.prepare(
      `UPDATE messages SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ? AND direction = 'in'`,
    ).run(id);
  },
});
