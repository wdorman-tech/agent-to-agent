#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { baseUrlFromConfig, makeClient } from './http.js';
import { cliInit } from './init.js';

const program = new Command();
program
  .name('a2a')
  .description(
    'agent-to-agent: federated, signed messaging between agents. Add contacts by sharing codes; send and receive messages.',
  )
  .version('0.1.0');

program
  .command('init')
  .description("Generate keys, write .env, print this agent's contact code.")
  .option('-u, --public-url <url>', 'public URL peers will reach your inbox at (https://...)')
  .option('-n, --display-name <name>', 'human display name')
  .option('-p, --port <port>', 'port to bind (default 4242)', (v) => parseInt(v, 10))
  .option('--api-token <token>', 'bearer token for non-loopback /api access')
  .option(
    '--dev',
    'shortcut: default --public-url to http://127.0.0.1:<port> and allow insecure HTTP',
  )
  .option('-f, --force', 'overwrite an existing .env')
  .action(async (opts) => {
    await cliInit(opts);
  });

program
  .command('serve')
  .description('Run the agent server (alias for `node dist/index.js`).')
  .action(async () => {
    await import('../index.js');
  });

function client() {
  const config = loadConfig();
  const base = baseUrlFromConfig(config.host, config.port);
  return makeClient(base, config.apiToken);
}

function fmtFp(fp: string): string {
  return fp;
}

program
  .command('me')
  .description("Print this agent's contact code, fingerprint, and inbox URL.")
  .option('--json', 'emit JSON')
  .action(async (opts) => {
    const me = await client().get<any>('/api/me');
    if (opts.json) {
      console.log(JSON.stringify(me, null, 2));
      return;
    }
    console.log(`display name: ${me.display_name}`);
    console.log(`fingerprint:  ${me.fingerprint}`);
    console.log(`inbox URL:    ${me.inbox_url}`);
    console.log('');
    console.log('Share this contact code:');
    console.log('');
    console.log(`  ${me.contact_code}`);
  });

const contact = program.command('contact').description('Manage your contact list.');

contact
  .command('add <code>')
  .description('Add a contact (paste their a2a1.* contact code).')
  .option('-n, --nickname <name>', 'optional local nickname')
  .option('--json', 'emit JSON')
  .action(async (code: string, opts: { nickname?: string; json?: boolean }) => {
    const r = await client().post<any>('/api/contacts', {
      code,
      nickname: opts.nickname,
    });
    if (opts.json) {
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    console.log(`added: ${fmtFp(r.fingerprint)}${r.nickname ? ` (${r.nickname})` : ''}`);
    console.log(`endpoint: ${r.endpoint_url}`);
  });

contact
  .command('list')
  .description('List contacts.')
  .option('--json', 'emit JSON')
  .action(async (opts) => {
    const list = await client().get<any[]>('/api/contacts');
    if (opts.json) {
      console.log(JSON.stringify(list, null, 2));
      return;
    }
    if (!list.length) {
      console.log('(no contacts — `a2a contact add <code>`)');
      return;
    }
    for (const c of list) {
      console.log(`${c.fingerprint}${c.nickname ? `  (${c.nickname})` : ''}`);
      console.log(`  endpoint: ${c.endpoint_url}`);
      if (c.last_seen_at) console.log(`  last seen: ${c.last_seen_at}`);
    }
  });

contact
  .command('rm <ref>')
  .description('Remove a contact by fingerprint or nickname.')
  .action(async (ref: string) => {
    const r = await client().del<any>(`/api/contacts/${encodeURIComponent(ref)}`);
    console.log(`removed: ${r.removed}`);
  });

program
  .command('send <to> <body...>')
  .description('Send a message to a contact (by fingerprint or nickname).')
  .option('--reply-to <id>', 'message id this is a reply to')
  .option('--json', 'emit JSON')
  .action(async (to: string, bodyParts: string[], opts: { replyTo?: string; json?: boolean }) => {
    const r = await client().post<any>('/api/send', {
      to,
      body: bodyParts.join(' '),
      in_reply_to: opts.replyTo ?? null,
    });
    if (opts.json) {
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    console.log(`id:       ${r.id}`);
    console.log(`status:   ${r.delivery.ok ? 'delivered' : 'failed'}`);
    if (!r.delivery.ok) console.log(`error:    ${r.delivery.error}`);
  });

program
  .command('inbox')
  .description('Show inbox messages.')
  .option('--unread', 'only unread')
  .option('-n, --limit <n>', 'limit (default 20)', (v) => parseInt(v, 10), 20)
  .option('--json', 'emit JSON')
  .action(async (opts: { unread?: boolean; limit: number; json?: boolean }) => {
    const qs = new URLSearchParams();
    if (opts.unread) qs.set('unread', 'true');
    qs.set('limit', String(opts.limit));
    const list = await client().get<any[]>(`/api/inbox?${qs.toString()}`);
    if (opts.json) {
      console.log(JSON.stringify(list, null, 2));
      return;
    }
    if (!list.length) {
      console.log(opts.unread ? '(no unread messages)' : '(empty inbox)');
      return;
    }
    for (const m of list) {
      const unread = m.read_at ? ' ' : '*';
      console.log(`${unread} ${m.received_at}  ${m.from_fingerprint}  id=${m.id}`);
      console.log(`   ${m.body.split('\n').join('\n   ')}`);
      if (m.in_reply_to) console.log(`   (reply to ${m.in_reply_to})`);
    }
  });

program
  .command('read <id>')
  .description('Show one inbox message and mark it read.')
  .option('--json', 'emit JSON')
  .action(async (id: string, opts) => {
    const m = await client().post<any>(`/api/inbox/${encodeURIComponent(id)}/read`);
    if (opts.json) {
      console.log(JSON.stringify(m, null, 2));
      return;
    }
    console.log(`from:      ${m.from_fingerprint}`);
    console.log(`timestamp: ${m.timestamp}`);
    if (m.in_reply_to) console.log(`reply-to:  ${m.in_reply_to}`);
    console.log('');
    console.log(m.body);
  });

program
  .command('outbox')
  .description('Show recently sent messages and their delivery status.')
  .option('--json', 'emit JSON')
  .option('-n, --limit <n>', 'limit (default 20)', (v) => parseInt(v, 10), 20)
  .action(async (opts: { limit: number; json?: boolean }) => {
    const list = await client().get<any[]>(`/api/outbox?limit=${opts.limit}`);
    if (opts.json) {
      console.log(JSON.stringify(list, null, 2));
      return;
    }
    if (!list.length) {
      console.log('(nothing sent yet)');
      return;
    }
    for (const m of list) {
      console.log(`${m.received_at}  → ${m.to_fingerprint}  [${m.status}]  id=${m.id}`);
      console.log(`   ${m.body.split('\n').join('\n   ').slice(0, 200)}`);
      if (m.error) console.log(`   error: ${m.error}`);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
