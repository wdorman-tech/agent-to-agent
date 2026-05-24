import type { AppContext } from '../app.js';
import type { ContactRow } from '../db/repos.js';
import { messagesRepo } from '../db/repos.js';
import type { Envelope } from '../protocol/envelope.js';

export interface DeliveryResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function deliverEnvelope(
  ctx: AppContext,
  envelope: Envelope,
  contact: ContactRow,
): Promise<DeliveryResult> {
  const messages = messagesRepo(ctx.db);
  messages.bumpDelivery(envelope.id);

  if (!ctx.config.allowInsecureHttp && contact.endpoint_url.startsWith('http://')) {
    const msg = 'plaintext HTTP endpoint refused; set ALLOW_INSECURE_HTTP=true for dev';
    messages.updateStatus(envelope.id, 'failed', msg);
    return { ok: false, error: msg };
  }

  let res: Response;
  try {
    res = await fetch(contact.endpoint_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/agent+json',
        'user-agent': `a2a/0.1 (${ctx.identity.fingerprint})`,
      },
      body: JSON.stringify(envelope),
    });
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : 'unknown network error';
    messages.updateStatus(envelope.id, 'failed', msg);
    ctx.logger.warn(
      { id: envelope.id, endpoint: contact.endpoint_url, err: msg },
      'delivery: network error',
    );
    return { ok: false, error: msg };
  }

  if (res.status >= 200 && res.status < 300) {
    messages.updateStatus(envelope.id, 'delivered');
    ctx.logger.info(
      { id: envelope.id, to: contact.fingerprint, status: res.status },
      'delivery: success',
    );
    return { ok: true, status: res.status };
  }

  const bodyText = await res.text().catch(() => '');
  const err = `HTTP ${res.status}: ${bodyText.slice(0, 200)}`;
  messages.updateStatus(envelope.id, 'failed', err);
  ctx.logger.warn(
    { id: envelope.id, to: contact.fingerprint, status: res.status, body: bodyText.slice(0, 200) },
    'delivery: rejected by peer',
  );
  return { ok: false, status: res.status, error: err };
}
