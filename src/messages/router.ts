import type { AppContext } from '../app.js';
import { contactsRepo, type MessageStatus, messagesRepo } from '../db/repos.js';
import { NotAContact, ProtocolError, Replay, Stale, UnknownRecipient } from '../lib/errors.js';
import { isFresh } from '../lib/time.js';
import {
  type Envelope,
  fromAddrPubkey,
  parseEnvelope,
  toAddrPubkey,
  verifyOrThrow,
} from '../protocol/envelope.js';

export interface AcceptResult {
  envelope: Envelope;
}

export class Router {
  constructor(private readonly ctx: AppContext) {}

  /** Process an inbound POST body. Either persists as 'received' or throws ProtocolError. */
  async accept(rawBody: unknown): Promise<AcceptResult> {
    const envelope = parseEnvelope(rawBody);
    const messages = messagesRepo(this.ctx.db);
    const contacts = contactsRepo(this.ctx.db);

    // 2. recipient matches us
    const toPubkey = toAddrPubkey(envelope);
    if (!toPubkey.equals(this.ctx.identity.pubkey)) {
      this.persist(envelope, 'rejected_unknown_recipient', 'recipient mismatch');
      throw UnknownRecipient();
    }

    // 3. freshness
    if (!isFresh(envelope.timestamp)) {
      this.persist(envelope, 'rejected_stale', envelope.timestamp);
      throw Stale();
    }

    // 4. replay
    if (messages.exists(envelope.id)) {
      throw Replay();
    }

    // 5. sender is in contacts
    const fromPubkey = fromAddrPubkey(envelope);
    const contact = contacts.byPubkey(fromPubkey);
    if (!contact) {
      this.persist(envelope, 'rejected_not_a_contact', 'sender pubkey not in contacts');
      throw NotAContact();
    }

    // 6. verify signature against the contact's pubkey
    try {
      verifyOrThrow(envelope, contact.pubkey);
    } catch (err) {
      this.persist(envelope, 'rejected_signature');
      if (err instanceof ProtocolError) throw err;
      throw err;
    }

    // 7. persist as received
    this.persist(envelope, 'received');
    contacts.touchSeen(contact.pubkey);
    this.ctx.logger.info(
      {
        id: envelope.id,
        from: contact.fingerprint,
        nickname: contact.nickname,
        bytes: envelope.body.length,
      },
      'inbox: received',
    );

    return { envelope };
  }

  private persist(envelope: Envelope, status: MessageStatus, error?: string | null): void {
    const repo = messagesRepo(this.ctx.db);
    if (repo.exists(envelope.id)) {
      repo.updateStatus(envelope.id, status, error ?? null);
      return;
    }
    repo.insert({
      id: envelope.id,
      direction: 'in',
      from_pubkey: fromAddrPubkey(envelope),
      to_pubkey: toAddrPubkey(envelope),
      timestamp: envelope.timestamp,
      in_reply_to: envelope.in_reply_to,
      body: envelope.body,
      envelope: JSON.stringify(envelope),
      status,
      error: error ?? null,
    });
  }
}
