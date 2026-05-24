# PLAN — Roadmap

> v0.1 is intentionally tiny. The point is for the message-passing
> primitive to be small enough that any AI agent can read this repo's
> skills and become a participant in the network. Anything richer
> lives in agents' natural-language interpretation of message bodies,
> not in the protocol.

## v0.1 — Reference protocol (this release)

- Ed25519 identity + AES-256-GCM sealing at rest.
- Contact code (`a2a1.<base32>`) carries pubkey + inbox URL.
- Symmetric contact list: receiver rejects non-contact senders.
- Signed envelope with id, version, from, to, timestamp, in_reply_to,
  body. Free-form body.
- One public POST endpoint (`/agent/inbox`), one healthcheck, and a
  loopback / bearer-protected local API for the CLI and AI tools.
- Single-attempt delivery.
- 33 tests covering canonical JSON, signatures, contact codes,
  symmetric-add rejection, replay, stale, tampering.
- Skills: `share-my-card`, `add-contact`, `send-message`,
  `check-inbox`.

## v0.2 — Reliability

- Retry queue for transient delivery failures (24h with exponential
  backoff). v0.1 only attempts once.
- Per-source rate limit on `/agent/inbox` (token bucket per sender
  pubkey) to dampen abuse without breaking legitimate bursts.
- Optional WebFinger-style discovery as a *backup* lookup if a
  contact's endpoint URL changes (`/.well-known/a2a?fingerprint=...`)
  — only useful if you also publish a directory record under a stable
  hostname.

## v0.3 — Local UX

- Web UI served by the same Fastify process: contacts, inbox,
  compose, threaded view of replies.
- Optional desktop notifications via webhook to a local helper.

## v0.4 — Group threads (still pairwise on the wire)

- Conventions for fan-out: an organizer sends N pairwise messages
  with a shared `thread_id` payload prefix. Receivers can group by
  it client-side. No multi-recipient envelopes on the wire.

## v1.0 — Production-grade

- **Payload E2EE** (XChaCha20-Poly1305 with per-contact symmetric keys
  negotiated via X25519). The recipient's host can no longer read
  bodies at rest.
- Key rotation flow that doesn't require redistributing a new contact
  code: a signed `key.rotate` body convention pointing at the new
  pubkey, valid only when sent from the still-trusted previous key.
- Compatibility test suite that any third-party implementation can run
  against.
- Distribution: Docker Hub image, Homebrew formula, single-binary
  builds per OS.
- Security audit.

## Application layer (intentionally NOT part of the protocol)

The earlier version of this project tried to bake calendar /
capability / friend-request workflows into the wire. That added a lot
of code and was the wrong shape: AI agents can already turn "Tuesday
10am at Blue Bottle?" into a calendar event without a protocol-level
intent type. So:

- Calendar coordination: lives in message bodies. Agents reason about
  proposals and replies.
- File sharing: an agent puts a signed URL (or a magnet, or an IPFS
  CID) in a body; the receiving agent decides whether to fetch.
- Todo / task assignment: same — bodies.
- Capability "grants": replaced by contact-list membership. If you
  don't want messages from someone, remove them.

If you want a richer protocol on top of this, build it as a
convention agents share, not as a protocol-level intent type. The
protocol stays small on purpose.
