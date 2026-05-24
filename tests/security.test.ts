import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { generateEd25519 } from '../src/identity/keys.js';
import { encodeContactCode } from '../src/lib/contact-code.js';
import { buildUnsigned, signEnvelope } from '../src/protocol/envelope.js';
import { api, nextTestPort, startTestInstance, type TestInstance } from './helpers.ts';

async function postEnvelope(inboxUrl: string, env: unknown) {
  return fetch(inboxUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/agent+json' },
    body: JSON.stringify(env),
  });
}

describe('inbox security', () => {
  let will: TestInstance;
  let alice: TestInstance;

  beforeAll(async () => {
    will = await startTestInstance({ displayName: 'will', port: nextTestPort() });
    alice = await startTestInstance({ displayName: 'alice', port: nextTestPort() });
    // Bidirectional add for the cases that require contact membership.
    await api(will.baseUrl, 'POST', '/api/contacts', { code: alice.contactCode });
    await api(alice.baseUrl, 'POST', '/api/contacts', { code: will.contactCode });
  });

  afterAll(async () => {
    await will?.close();
    await alice?.close();
  });

  test('sender not in recipient contacts → 403 not_a_contact', async () => {
    const stranger = await startTestInstance({ displayName: 'stranger', port: nextTestPort() });
    try {
      // Stranger adds Alice unilaterally (so it can send), but Alice does NOT add stranger.
      await api(stranger.baseUrl, 'POST', '/api/contacts', { code: alice.contactCode });
      const send = await api<any>(stranger.baseUrl, 'POST', '/api/send', {
        to: alice.fingerprint,
        body: 'unsolicited',
      });
      expect(send.delivery.ok).toBe(false);
      expect(send.delivery.error).toMatch(/HTTP 403/);
      expect(send.delivery.error).toMatch(/not_a_contact/);
    } finally {
      await stranger.close();
    }
  });

  test('replay of the same envelope is rejected', async () => {
    const me = will.ctx.identity;
    const env = signEnvelope(
      buildUnsigned({
        fromPubkey: me.pubkey,
        toPubkey: alice.pubkey,
        body: 'replay-test',
      }),
      me.privateKey,
      me.pubkey,
    );
    const r1 = await postEnvelope(alice.inboxUrl, env);
    expect(r1.status).toBe(202);
    const r2 = await postEnvelope(alice.inboxUrl, env);
    expect(r2.status).toBe(400);
    const body = await r2.json();
    expect(body.error).toBe('replay');
  });

  test('stale timestamp is rejected', async () => {
    const me = will.ctx.identity;
    const env = signEnvelope(
      buildUnsigned({
        fromPubkey: me.pubkey,
        toPubkey: alice.pubkey,
        body: 'stale-test',
        now: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      }),
      me.privateKey,
      me.pubkey,
    );
    const r = await postEnvelope(alice.inboxUrl, env);
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error).toBe('stale');
  });

  test('tampered body fails signature verification', async () => {
    const me = will.ctx.identity;
    const env = signEnvelope(
      buildUnsigned({
        fromPubkey: me.pubkey,
        toPubkey: alice.pubkey,
        body: 'original',
      }),
      me.privateKey,
      me.pubkey,
    );
    const tampered: any = JSON.parse(JSON.stringify(env));
    tampered.body = 'tampered';
    // Fresh id so it bypasses replay protection.
    tampered.id = `${env.id}_t`;
    const r = await postEnvelope(alice.inboxUrl, tampered);
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.error).toBe('bad_signature');
  });

  test('wrong recipient is rejected', async () => {
    const other = generateEd25519();
    const me = will.ctx.identity;
    const env = signEnvelope(
      buildUnsigned({
        fromPubkey: me.pubkey,
        toPubkey: other.publicKeyRaw,
        body: 'misaddressed',
      }),
      me.privateKey,
      me.pubkey,
    );
    const r = await postEnvelope(alice.inboxUrl, env);
    expect(r.status).toBe(404);
    const body = await r.json();
    expect(body.error).toBe('unknown_recipient');
  });

  test('adding self as a contact is rejected', async () => {
    const code = encodeContactCode({
      pubkey: alice.pubkey,
      endpointUrl: alice.inboxUrl,
    });
    const res = await fetch(`${alice.baseUrl}/api/contacts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('self');
  });
});
