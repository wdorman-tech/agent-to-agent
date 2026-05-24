export class ProtocolError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export const BadEnvelope = (msg: string) => new ProtocolError(msg, 400, 'bad_envelope');
export const BadSignature = (msg = 'signature did not verify') =>
  new ProtocolError(msg, 401, 'bad_signature');
export const NotAContact = () =>
  new ProtocolError('sender is not in your contacts', 403, 'not_a_contact');
export const UnknownRecipient = () =>
  new ProtocolError('recipient pubkey does not match this instance', 404, 'unknown_recipient');
export const Stale = () =>
  new ProtocolError('message timestamp outside freshness window', 400, 'stale');
export const Replay = () => new ProtocolError('duplicate message id', 400, 'replay');
export const RateLimited = () => new ProtocolError('too many requests', 429, 'rate_limited');
export const UnknownContact = (ref: string) =>
  new ProtocolError(`unknown contact: ${ref}`, 404, 'unknown_contact');
