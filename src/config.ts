import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

function readDotenv(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const ConfigSchema = z.object({
  publicBaseUrl: z.string().url(),
  inboxPath: z.string().default('/agent/inbox'),
  displayName: z.string().min(1).default('agent'),
  masterKey: z.instanceof(Buffer).refine((b) => b.length === 32, {
    message: 'AGENT_MASTER_KEY must decode to exactly 32 bytes',
  }),
  port: z.coerce.number().int().min(1).max(65535).default(4242),
  host: z.string().default('0.0.0.0'),
  dbPath: z.string(),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']).default('info'),
  allowInsecureHttp: z.boolean().default(false),
  apiToken: z.string().nullable(),
});

export type Config = z.infer<typeof ConfigSchema>;

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v == null) return fallback;
  return /^(1|true|yes|on)$/i.test(v);
}

export interface LoadConfigOpts {
  envPath?: string;
  overrides?: Record<string, string>;
}

export function loadConfig(opts?: LoadConfigOpts): Config {
  const envPath = opts?.envPath ?? path.resolve(process.cwd(), '.env');
  const fileEnv = readDotenv(envPath);
  const env: Record<string, string | undefined> = {
    ...fileEnv,
    ...process.env,
    ...(opts?.overrides ?? {}),
  };

  const masterKeyB64 = env.AGENT_MASTER_KEY;
  if (!masterKeyB64) {
    throw new Error(
      "AGENT_MASTER_KEY is required. Generate one with `node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`.",
    );
  }
  const masterKey = Buffer.from(masterKeyB64, 'base64');

  const port = Number(env.PORT ?? 4242);
  const publicBaseUrl =
    env.PUBLIC_BASE_URL ??
    (env.HOST === '127.0.0.1' || !env.HOST ? `http://127.0.0.1:${port}` : '');
  if (!publicBaseUrl) {
    throw new Error(
      'PUBLIC_BASE_URL is required for production (the URL peers reach your inbox at).',
    );
  }

  return ConfigSchema.parse({
    publicBaseUrl,
    inboxPath: env.INBOX_PATH ?? '/agent/inbox',
    displayName: env.DISPLAY_NAME ?? 'agent',
    masterKey,
    port,
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DB_PATH ?? path.resolve(process.cwd(), 'data/agent.db'),
    logLevel: env.LOG_LEVEL ?? 'info',
    allowInsecureHttp: parseBool(env.ALLOW_INSECURE_HTTP, false),
    apiToken: env.API_TOKEN && env.API_TOKEN.length > 0 ? env.API_TOKEN : null,
  });
}

export function inboxUrlOf(config: Config): string {
  return new URL(config.inboxPath, config.publicBaseUrl).toString();
}
