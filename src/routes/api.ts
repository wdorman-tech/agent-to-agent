import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.js';
import { inboxUrlOf } from '../config.js';
import { contactsRepo, messagesRepo } from '../db/repos.js';
import { fingerprintOf } from '../identity/fingerprint.js';
import { decodeContactCode, encodeContactCode } from '../lib/contact-code.js';
import { UnknownContact } from '../lib/errors.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLoopback(req: FastifyRequest): boolean {
  return LOOPBACK.has(req.ip);
}

function bearerMatches(req: FastifyRequest, expected: string): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  const supplied = auth.slice('Bearer '.length).trim();
  if (supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function serializeContact(row: {
  pubkey: Buffer;
  fingerprint: string;
  nickname: string | null;
  endpoint_url: string;
  added_at: string;
  last_seen_at: string | null;
}) {
  return {
    fingerprint: row.fingerprint,
    nickname: row.nickname,
    endpoint_url: row.endpoint_url,
    added_at: row.added_at,
    last_seen_at: row.last_seen_at,
    pubkey_base64: row.pubkey.toString('base64'),
  };
}

function serializeMessage(row: {
  id: string;
  direction: 'in' | 'out';
  from_pubkey: Buffer;
  to_pubkey: Buffer;
  timestamp: string;
  in_reply_to: string | null;
  body: string;
  status: string;
  read_at: string | null;
  received_at: string;
}) {
  return {
    id: row.id,
    direction: row.direction,
    from_fingerprint: fingerprintOf(row.from_pubkey),
    to_fingerprint: fingerprintOf(row.to_pubkey),
    timestamp: row.timestamp,
    in_reply_to: row.in_reply_to,
    body: row.body,
    status: row.status,
    read_at: row.read_at,
    received_at: row.received_at,
  };
}

export function registerApi(app: FastifyInstance, ctx: AppContext): void {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    if (isLoopback(req)) return;
    if (ctx.config.apiToken && bearerMatches(req, ctx.config.apiToken)) return;
    reply.code(403).send({
      error: 'forbidden',
      message: ctx.config.apiToken
        ? '/api requires loopback or Bearer token'
        : '/api is loopback-only (set API_TOKEN to enable remote access)',
    });
  });

  // ---------- self ----------

  app.get('/api/me', async (_req, reply) => {
    const code = encodeContactCode({
      pubkey: ctx.identity.pubkey,
      endpointUrl: inboxUrlOf(ctx.config),
    });
    reply.send({
      display_name: ctx.identity.displayName,
      fingerprint: ctx.identity.fingerprint,
      pubkey_base64: ctx.identity.pubkey.toString('base64'),
      inbox_url: inboxUrlOf(ctx.config),
      contact_code: code,
      created_at: ctx.identity.createdAt,
    });
  });

  // ---------- contacts ----------

  const AddContactBody = z.object({
    code: z.string().min(10),
    nickname: z.string().min(1).max(64).optional(),
  });

  app.get('/api/contacts', async (_req, reply) => {
    reply.send(contactsRepo(ctx.db).list().map(serializeContact));
  });

  app.post('/api/contacts', async (req, reply) => {
    const body = AddContactBody.parse(req.body);
    let decoded: ReturnType<typeof decodeContactCode>;
    try {
      decoded = decodeContactCode(body.code);
    } catch (err) {
      reply.code(400).send({
        error: 'bad_contact_code',
        message: err instanceof Error ? err.message : 'failed to decode contact code',
      });
      return;
    }
    if (decoded.pubkey.equals(ctx.identity.pubkey)) {
      reply.code(400).send({ error: 'self', message: 'cannot add yourself as a contact' });
      return;
    }
    const fingerprint = fingerprintOf(decoded.pubkey);
    contactsRepo(ctx.db).add({
      pubkey: decoded.pubkey,
      fingerprint,
      endpointUrl: decoded.endpointUrl,
      nickname: body.nickname ?? null,
    });
    const stored = contactsRepo(ctx.db).byPubkey(decoded.pubkey);
    reply.code(201).send(stored ? serializeContact(stored) : null);
  });

  app.delete<{ Params: { ref: string } }>('/api/contacts/:ref', async (req, reply) => {
    const repo = contactsRepo(ctx.db);
    const ref = req.params.ref;
    const contact = repo.byFingerprint(ref) ?? repo.byNickname(ref);
    if (!contact) {
      reply.code(404).send({ error: 'not_found' });
      return;
    }
    repo.remove(contact.pubkey);
    reply.send({ ok: true, removed: contact.fingerprint });
  });

  // ---------- send ----------

  const SendBody = z.object({
    to: z.string().min(1),
    body: z
      .string()
      .min(1)
      .max(64 * 1024),
    in_reply_to: z.string().nullable().optional(),
  });

  app.post('/api/send', async (req, reply) => {
    const body = SendBody.parse(req.body);
    try {
      const result = await ctx.outbox.send({
        to: body.to,
        body: body.body,
        in_reply_to: body.in_reply_to ?? null,
      });
      reply.send({
        id: result.envelope.id,
        timestamp: result.envelope.timestamp,
        delivery: result.delivery,
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('unknown contact')) {
        reply.code(404).send({ error: 'unknown_contact', message: err.message });
        return;
      }
      const e = UnknownContact(body.to);
      void e;
      throw err;
    }
  });

  // ---------- inbox ----------

  app.get<{ Querystring: { unread?: string; limit?: string } }>(
    '/api/inbox',
    async (req, reply) => {
      const unread = req.query.unread === 'true' || req.query.unread === '1';
      const limit = req.query.limit ? Math.max(1, Math.min(500, Number(req.query.limit))) : 50;
      const rows = messagesRepo(ctx.db).inbox({ unreadOnly: unread, limit });
      reply.send(rows.map(serializeMessage));
    },
  );

  app.get<{ Params: { id: string } }>('/api/inbox/:id', async (req, reply) => {
    const row = messagesRepo(ctx.db).get(req.params.id);
    if (!row || row.direction !== 'in') {
      reply.code(404).send({ error: 'not_found' });
      return;
    }
    reply.send(serializeMessage(row));
  });

  app.post<{ Params: { id: string } }>('/api/inbox/:id/read', async (req, reply) => {
    const repo = messagesRepo(ctx.db);
    const row = repo.get(req.params.id);
    if (!row || row.direction !== 'in') {
      reply.code(404).send({ error: 'not_found' });
      return;
    }
    repo.markRead(req.params.id);
    const fresh = repo.get(req.params.id);
    reply.send(fresh ? serializeMessage(fresh) : { ok: true });
  });

  // ---------- outbox (read-only audit) ----------

  app.get<{ Querystring: { limit?: string } }>('/api/outbox', async (req, reply) => {
    const limit = req.query.limit ? Math.max(1, Math.min(500, Number(req.query.limit))) : 50;
    reply.send(
      messagesRepo(ctx.db)
        .outbox(limit)
        .map((r) => ({
          ...serializeMessage(r),
          error: r.error,
          delivery_attempts: r.delivery_attempts,
        })),
    );
  });
}
