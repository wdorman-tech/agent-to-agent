/**
 * Two-instance in-process demo.
 *
 *   pnpm demo
 *
 * Spawns "will" and "alice" agents on loopback, has them add each other
 * as contacts (the symmetric-add rule), then exchanges a couple of
 * threaded messages. Prints what happens at each step.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pino } from 'pino';
import { loadConfig } from '../src/config.js';
import { closeDb } from '../src/db/index.js';
import { buildAppContext, buildServer } from '../src/server.js';

interface Inst {
  name: string;
  base: string;
  fingerprint: string;
  contactCode: string;
  close: () => Promise<void>;
}

async function startInstance(name: string, port: number): Promise<Inst> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `a2a-demo-${name}-`));
  const config = loadConfig({
    overrides: {
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      DISPLAY_NAME: name,
      AGENT_MASTER_KEY: randomBytes(32).toString('base64'),
      PORT: String(port),
      HOST: '127.0.0.1',
      DB_PATH: path.join(tmpDir, 'agent.db'),
      LOG_LEVEL: 'warn',
      ALLOW_INSECURE_HTTP: 'true',
    },
  });
  const ctx = buildAppContext({ config, loggerOverride: pino({ level: 'warn' }) });
  const app = await buildServer(ctx);
  await app.listen({ port, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${port}`;
  const me = await fetch(`${base}/api/me`).then((r) => r.json() as Promise<any>);
  return {
    name,
    base,
    fingerprint: me.fingerprint,
    contactCode: me.contact_code,
    close: async () => {
      await app.close();
      closeDb(ctx.db);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

async function call<T>(base: string, method: 'GET' | 'POST', p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${p} → HTTP ${res.status}: ${await res.text()}`);
  return res.text().then((t) => (t ? JSON.parse(t) : (undefined as T)));
}

function divider(title: string) {
  console.log(`\n${'─'.repeat(70)}\n  ${title}\n${'─'.repeat(70)}`);
}

async function main() {
  console.log('Starting two demo agents on 127.0.0.1...');
  const will = await startInstance('will', 14242);
  const alice = await startInstance('alice', 14243);
  console.log(`  will:  ${will.fingerprint}`);
  console.log(`  alice: ${alice.fingerprint}`);

  try {
    divider("1. Exchange contact codes (this is the part you'd do via copy-paste)");
    console.log("will's contact code:");
    console.log(`  ${will.contactCode}`);
    console.log("alice's contact code:");
    console.log(`  ${alice.contactCode}`);

    divider("2. Symmetric add — each instance adds the other to its contacts");
    await call(will.base, 'POST', '/api/contacts', { code: alice.contactCode, nickname: 'alice' });
    await call(alice.base, 'POST', '/api/contacts', { code: will.contactCode, nickname: 'will' });
    console.log("will's contacts:", await call<any[]>(will.base, 'GET', '/api/contacts'));
    console.log("alice's contacts:", await call<any[]>(alice.base, 'GET', '/api/contacts'));

    divider("3. will → alice: 'hey, are you free Tuesday for coffee?'");
    const send1 = await call<any>(will.base, 'POST', '/api/send', {
      to: 'alice',
      body: 'hey, are you free Tuesday for coffee?',
    });
    console.log(`sent id=${send1.id} delivery=${send1.delivery.ok ? 'OK' : 'FAILED'}`);

    divider("4. alice's inbox");
    const inbox1 = await call<any[]>(alice.base, 'GET', '/api/inbox');
    for (const m of inbox1) {
      console.log(`  ${m.received_at}  from ${m.from_fingerprint}`);
      console.log(`  > ${m.body}`);
    }

    divider("5. alice → will: 'yes! 10am at Blue Bottle?' (threaded reply)");
    const replyToId = inbox1[0]!.id;
    const send2 = await call<any>(alice.base, 'POST', '/api/send', {
      to: 'will',
      body: 'yes! 10am at Blue Bottle?',
      in_reply_to: replyToId,
    });
    console.log(`sent id=${send2.id} (in_reply_to=${replyToId})`);

    divider("6. will's inbox");
    const inbox2 = await call<any[]>(will.base, 'GET', '/api/inbox');
    for (const m of inbox2) {
      console.log(`  ${m.received_at}  from ${m.from_fingerprint}${m.in_reply_to ? `  (reply to ${m.in_reply_to})` : ''}`);
      console.log(`  > ${m.body}`);
    }

    divider("7. demonstrate the symmetric-add rule");
    // Show that a message from a non-contact would be rejected.
    console.log("  An unknown agent's POST to alice's inbox would get HTTP 403 not_a_contact.");
    console.log("  (For brevity, we don't spin up a third instance here.)");

    divider('demo complete');
  } finally {
    await will.close();
    await alice.close();
  }
}

main().catch((err) => {
  console.error('demo failed:', err);
  process.exit(1);
});
