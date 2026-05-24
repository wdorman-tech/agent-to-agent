import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app.js';
import { inboxUrlOf } from '../config.js';
import { encodeContactCode } from '../lib/contact-code.js';

export function registerStatus(app: FastifyInstance, ctx: AppContext): void {
  app.get('/healthz', async (_req, reply) => {
    reply.send({ ok: true, fingerprint: ctx.identity.fingerprint });
  });

  app.get('/', async (_req, reply) => {
    const code = encodeContactCode({
      pubkey: ctx.identity.pubkey,
      endpointUrl: inboxUrlOf(ctx.config),
    });
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>a2a — ${ctx.identity.fingerprint}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:48rem;margin:3rem auto;padding:0 1rem;color:#222}
code,pre{background:#f3f3f3;padding:.1rem .3rem;border-radius:3px;word-break:break-all}
pre{padding:.6rem;font-size:12px}small{color:#666}</style></head>
<body>
<h1>agent-to-agent</h1>
<p><small>v0.1 reference instance — display name: <code>${ctx.identity.displayName}</code></small></p>
<p>Share this contact code with someone so they can add you:</p>
<pre>${code}</pre>
<p>Your fingerprint: <code>${ctx.identity.fingerprint}</code></p>
<ul>
  <li>Inbox: <code>POST ${inboxUrlOf(ctx.config)}</code></li>
  <li>Local API: <code>GET /api/me</code>, <code>/api/contacts</code>, <code>/api/inbox</code></li>
</ul>
</body></html>`);
  });
}
