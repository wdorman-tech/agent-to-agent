import type { Config } from '../config.js';
import type { DB } from '../db/index.js';
import { type KeyRow, keysRepo, usersRepo } from '../db/repos.js';
import { fingerprintOf } from './fingerprint.js';
import { generateEd25519 } from './keys.js';
import { seal, unseal } from './seal.js';

export interface PrimaryIdentity {
  pubkey: Buffer; // 32 bytes
  privateKey: Buffer; // 32 bytes, unsealed
  fingerprint: string; // 12-char base32 of sha256(pubkey)
  displayName: string;
  createdAt: string;
}

export class IdentityService {
  constructor(
    private readonly db: DB,
    private readonly config: Config,
  ) {}

  /** Generate the primary keypair on first run; reuse it thereafter. */
  ensureLocalIdentity(displayName: string): PrimaryIdentity {
    const existing = keysRepo(this.db).primary();
    if (existing) return this.unseal(existing, displayName);
    return this.createPrimary(displayName);
  }

  loadPrimary(): PrimaryIdentity {
    const row = keysRepo(this.db).primary();
    if (!row) {
      throw new Error('no primary key — run `a2a init` first');
    }
    const user = usersRepo(this.db).get(row.pubkey);
    return this.unseal(row, user?.display_name ?? 'agent');
  }

  private createPrimary(displayName: string): PrimaryIdentity {
    const { publicKeyRaw, privateKeyRaw } = generateEd25519();
    const sealed = seal(privateKeyRaw, this.config.masterKey);

    const users = usersRepo(this.db);
    const keys = keysRepo(this.db);
    users.upsert(publicKeyRaw, displayName);
    keys.demoteAllPrimaries();
    keys.insert({
      pubkey: publicKeyRaw,
      private_key: sealed,
      is_primary: 1,
    });

    const row = keys.get(publicKeyRaw);
    if (!row) throw new Error('failed to insert primary key');
    return this.unseal(row, displayName);
  }

  private unseal(row: KeyRow, displayName: string): PrimaryIdentity {
    const privateKey = unseal(row.private_key, this.config.masterKey);
    return {
      pubkey: row.pubkey,
      privateKey,
      fingerprint: fingerprintOf(row.pubkey),
      displayName,
      createdAt: row.created_at,
    };
  }
}
