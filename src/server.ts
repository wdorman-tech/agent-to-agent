import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppContext } from './app.js';
import type { Config } from './config.js';
import { type DB, migrate, openDb } from './db/index.js';
import { IdentityService } from './identity/service.js';
import { createLogger, type Logger } from './logger.js';
import { Outbox } from './messages/outbox.js';
import { registerApi } from './routes/api.js';
import { registerInbox } from './routes/inbox.js';
import { registerStatus } from './routes/status.js';

export interface BuildAppOptions {
  config: Config;
  loggerOverride?: Logger;
  dbOverride?: DB;
}

export function buildAppContext(opts: BuildAppOptions): AppContext {
  const logger = opts.loggerOverride ?? createLogger(opts.config.logLevel);
  const db = opts.dbOverride ?? openDb(opts.config.dbPath);
  migrate(db);

  const identityService = new IdentityService(db, opts.config);
  const identity = identityService.ensureLocalIdentity(opts.config.displayName);

  const ctx: AppContext = {
    config: opts.config,
    db,
    logger,
    identity,
    // Outbox is built after ctx is constructed; assign after.
    outbox: null as unknown as Outbox,
  };
  ctx.outbox = new Outbox(ctx);
  return ctx;
}

export async function buildServer(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 256 * 1024,
  });

  await app.register(cors, { origin: false });
  app.addContentTypeParser('application/agent+json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  registerStatus(app, ctx);
  registerInbox(app, ctx);
  registerApi(app, ctx);
  return app;
}

export async function startServer(ctx: AppContext): Promise<{ app: FastifyInstance; url: string }> {
  const app = await buildServer(ctx);
  await app.listen({ port: ctx.config.port, host: ctx.config.host });
  const url = `http://${ctx.config.host === '0.0.0.0' ? 'localhost' : ctx.config.host}:${ctx.config.port}`;
  ctx.logger.info(
    {
      fingerprint: ctx.identity.fingerprint,
      url,
      inbox: ctx.config.publicBaseUrl + ctx.config.inboxPath,
    },
    'a2a instance ready',
  );
  return { app, url };
}
