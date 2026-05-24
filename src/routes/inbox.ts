import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app.js';
import { ProtocolError } from '../lib/errors.js';
import { Router } from '../messages/router.js';

export function registerInbox(app: FastifyInstance, ctx: AppContext): void {
  const router = new Router(ctx);

  app.post('/agent/inbox', async (req, reply) => {
    try {
      const result = await router.accept(req.body);
      reply.code(202).send({ id: result.envelope.id, status: 'received' });
    } catch (err) {
      if (err instanceof ProtocolError) {
        reply.code(err.httpStatus).send({ error: err.code, message: err.message });
        return;
      }
      const msg = err instanceof Error ? err.message : 'internal error';
      ctx.logger.error({ err: msg }, 'inbox: unhandled error');
      reply.code(500).send({ error: 'internal_error', message: msg });
    }
  });
}
