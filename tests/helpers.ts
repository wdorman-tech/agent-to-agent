import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import type { AppContext } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { closeDb } from '../src/db/index.js';
import { buildAppContext, buildServer } from '../src/server.js';

export interface TestInstance {
  ctx: AppContext;
  app: FastifyInstance;
  port: number;
  baseUrl: string;
  inboxUrl: string;
  contactCode: string;
  fingerprint: string;
  pubkey: Buffer;
  tmpDir: string;
  close: () => Promise<void>;
}

const silentLogger = pino({ level: 'silent' });

export async function startTestInstance(opts: {
  displayName: string;
  port: number;
}): Promise<TestInstance> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `a2a-test-${opts.displayName}-`));
  const config = loadConfig({
    overrides: {
      PUBLIC_BASE_URL: `http://127.0.0.1:${opts.port}`,
      DISPLAY_NAME: opts.displayName,
      AGENT_MASTER_KEY: randomBytes(32).toString('base64'),
      PORT: String(opts.port),
      HOST: '127.0.0.1',
      DB_PATH: path.join(tmpDir, 'agent.db'),
      LOG_LEVEL: 'silent',
      ALLOW_INSECURE_HTTP: 'true',
    },
  });
  const ctx = buildAppContext({ config, loggerOverride: silentLogger });
  const app = await buildServer(ctx);
  await app.listen({ port: opts.port, host: '127.0.0.1' });

  const baseUrl = `http://127.0.0.1:${opts.port}`;
  const me = await fetch(`${baseUrl}/api/me`).then((r) => r.json() as Promise<any>);

  return {
    ctx,
    app,
    port: opts.port,
    baseUrl,
    inboxUrl: me.inbox_url,
    contactCode: me.contact_code,
    fingerprint: me.fingerprint,
    pubkey: ctx.identity.pubkey,
    tmpDir,
    close: async () => {
      await app.close();
      closeDb(ctx.db);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

export async function api<T = unknown>(
  baseUrl: string,
  method: 'GET' | 'POST' | 'DELETE',
  pathStr: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrl}${pathStr}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${pathStr} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function waitFor<T>(
  fn: () => T | Promise<T>,
  predicate: (v: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const intervalMs = opts.intervalMs ?? 50;
  const start = Date.now();
  while (true) {
    const v = await fn();
    if (predicate(v)) return v;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

let nextPort = 14242;
export function nextTestPort(): number {
  return nextPort++;
}
