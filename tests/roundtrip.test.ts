import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { api, nextTestPort, startTestInstance, type TestInstance, waitFor } from './helpers.ts';

describe('two-instance roundtrip — symmetric add + message exchange', () => {
  let will: TestInstance;
  let alice: TestInstance;

  beforeAll(async () => {
    will = await startTestInstance({ displayName: 'will', port: nextTestPort() });
    alice = await startTestInstance({ displayName: 'alice', port: nextTestPort() });
  });

  afterAll(async () => {
    await will?.close();
    await alice?.close();
  });

  test('both add each other, then exchange threaded messages', async () => {
    // Symmetric add: each side imports the other's contact code.
    await api(will.baseUrl, 'POST', '/api/contacts', {
      code: alice.contactCode,
      nickname: 'alice',
    });
    await api(alice.baseUrl, 'POST', '/api/contacts', {
      code: will.contactCode,
      nickname: 'will',
    });

    // Will sends to Alice.
    const send1 = await api<any>(will.baseUrl, 'POST', '/api/send', {
      to: 'alice',
      body: 'hello Alice',
    });
    expect(send1.delivery.ok).toBe(true);

    // Alice's inbox shows it.
    const inbox1 = await waitFor(
      () => api<any[]>(alice.baseUrl, 'GET', '/api/inbox'),
      (list) => list.length > 0,
    );
    expect(inbox1[0].body).toBe('hello Alice');
    expect(inbox1[0].from_fingerprint).toBe(will.fingerprint);
    expect(inbox1[0].read_at).toBeNull();

    // Alice replies, threading via in_reply_to.
    const replyId = inbox1[0].id;
    const send2 = await api<any>(alice.baseUrl, 'POST', '/api/send', {
      to: 'will',
      body: 'hi William',
      in_reply_to: replyId,
    });
    expect(send2.delivery.ok).toBe(true);

    // Will sees the reply.
    const inbox2 = await waitFor(
      () => api<any[]>(will.baseUrl, 'GET', '/api/inbox'),
      (list) => list.length > 0,
    );
    expect(inbox2[0].body).toBe('hi William');
    expect(inbox2[0].in_reply_to).toBe(replyId);

    // Mark Alice's message read.
    await api(alice.baseUrl, 'POST', `/api/inbox/${replyId}/read`);
    const unread = await api<any[]>(alice.baseUrl, 'GET', '/api/inbox?unread=true');
    expect(unread.length).toBe(0);
  });

  test('listing contacts returns both with correct fingerprints', async () => {
    const aliceContacts = await api<any[]>(alice.baseUrl, 'GET', '/api/contacts');
    expect(aliceContacts.length).toBe(1);
    expect(aliceContacts[0].fingerprint).toBe(will.fingerprint);
    expect(aliceContacts[0].nickname).toBe('will');
  });
});
