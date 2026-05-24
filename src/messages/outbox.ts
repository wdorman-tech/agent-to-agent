import type { AppContext } from '../app.js';
import { contactsRepo, messagesRepo } from '../db/repos.js';
import { UnknownContact } from '../lib/errors.js';
import { buildUnsigned, type Envelope, signEnvelope } from '../protocol/envelope.js';
import { type DeliveryResult, deliverEnvelope } from './delivery.js';

export interface SendArgs {
  /** Fingerprint, nickname, or base32 pubkey of the recipient. */
  to: string;
  body: string;
  in_reply_to?: string | null;
}

export interface SendResult {
  envelope: Envelope;
  delivery: DeliveryResult;
}

export class Outbox {
  constructor(private readonly ctx: AppContext) {}

  async send(args: SendArgs): Promise<SendResult> {
    const contacts = contactsRepo(this.ctx.db);
    const ref = args.to.trim();
    const contact =
      contacts.byFingerprint(ref) ??
      contacts.byNickname(ref) ??
      (ref.length === 52 ? contacts.byFingerprint(ref) : undefined);
    if (!contact) throw UnknownContact(args.to);

    const me = this.ctx.identity;
    const unsigned = buildUnsigned({
      fromPubkey: me.pubkey,
      toPubkey: contact.pubkey,
      body: args.body,
      in_reply_to: args.in_reply_to ?? null,
    });
    const envelope = signEnvelope(unsigned, me.privateKey, me.pubkey);

    messagesRepo(this.ctx.db).insert({
      id: envelope.id,
      direction: 'out',
      from_pubkey: me.pubkey,
      to_pubkey: contact.pubkey,
      timestamp: envelope.timestamp,
      in_reply_to: envelope.in_reply_to,
      body: envelope.body,
      envelope: JSON.stringify(envelope),
      status: 'pending',
      error: null,
    });

    const delivery = await deliverEnvelope(this.ctx, envelope, contact);
    return { envelope, delivery };
  }
}
