# Agent-to-Agent Protocol — v0.1

> **License (this document):** MIT — see [LICENSE-SPEC](./LICENSE-SPEC).
> **Status:** v0.1. Breaking changes will bump the protocol version.

## 1. Purpose

A federated, peer-to-peer, signed messaging protocol that lets
independent personal/AI agents exchange free-form text messages.

Constraints:

- **Federated.** No central server. Two instances on two hosts talk
  over HTTPS, peer-to-peer.
- **Free to operate.** Pure software protocol; no required paid services.
- **Self-hosted.** One container or process per agent.
- **Privacy by default.** No third party sees message payloads. No
  telemetry.
- **Symmetric contact list.** Anyone can send you a contact code, but
  you only receive messages from senders you have explicitly added.

## 2. Identity & addressing

An **agent identity** is a long-lived Ed25519 keypair (RFC 8032).
The 32-byte public key, in raw form, IS the identity.

A **fingerprint** is a short identifier derived from the pubkey:
`base32(sha256(pubkey))[:12]` — 12 lowercase characters from the RFC
4648 alphabet. Used in UIs and CLI args. Not a substitute for the
full pubkey at verification time.

A **contact code** is the user-shareable string that encodes a pubkey
+ inbox URL into one pasteable token. v1 format:

```
a2a1.<base32 body>
```

Where `<base32 body>` is RFC 4648 lowercase (no padding) base32 of:

| Bytes | Field | Description |
|---|---|---|
| 1     | version | `0x01` |
| 32    | pubkey  | raw Ed25519 public key |
| 2     | url_len | big-endian length of the URL in bytes |
| url_len | url   | inbox URL, UTF-8 (e.g. `https://agent.example.com/agent/inbox`) |

Implementations MUST reject codes with the wrong prefix, the wrong
version byte, an inconsistent `url_len`, or a URL that does not
parse with the WHATWG URL parser.

Contact codes are exchanged out of band (chat, email, paste). There
is no DNS or directory dependency.

## 3. Envelope

The only message shape on the wire:

```jsonc
{
  "id":          "01HX...",       // ULID (Crockford base32, length 26)
  "version":     "0.1",
  "from":        "<base32 sender pubkey, 52 chars>",
  "to":          "<base32 recipient pubkey, 52 chars>",
  "timestamp":   "2026-05-23T15:30:00.000Z",  // ISO-8601 UTC
  "in_reply_to": null,            // or another envelope id; threading
  "body":        "free-form text, <= 64 KB UTF-8",
  "signature": {
    "algorithm": "ed25519",
    "value":     "<base64 64-byte signature>"
  }
}
```

The `from` and `to` fields are **base32-encoded full 32-byte
public keys** (RFC 4648 lowercase, no padding — 52 chars). Receivers
decode them and compare to the bytes they hold for the recipient and
sender.

## 4. Canonical JSON & signatures

To compute the bytes to sign:

1. Remove the `signature` field from the envelope.
2. Serialize the remaining object using **canonical JSON**:
   - Object keys sorted lexicographically by Unicode code point.
   - No whitespace.
   - Strings escaped per ECMA-404 JSON.
   - Numbers MUST be finite.
   - `undefined` values inside objects are omitted.
3. UTF-8 encode the result.
4. Sign with Ed25519. The signature is 64 bytes; the `value` field
   is its base64 encoding (standard, padded).

The receiver re-derives steps 1–3 and verifies the signature against
the sender's pubkey (which it has from its `contacts` table).

## 5. Transport

- Server-to-server over HTTPS (TLS 1.3+). Local dev MAY use plaintext
  HTTP when both peers explicitly opt in.
- Method: `POST <peer-inbox-url>`.
- Request header: `Content-Type: application/agent+json`.
- Body: the envelope JSON.

Response codes:

| Code | Meaning |
|---|---|
| `202 Accepted` | Verified and stored. |
| `400` | Malformed envelope, stale timestamp, replayed id, missing fields. Body: `{ "error": "<code>" }`. |
| `401` | Signature did not verify. |
| `403` | Sender not in recipient's contacts (`not_a_contact`). |
| `404` | Recipient pubkey does not match this instance. |
| `429` | Rate limited. |
| `503` | Transient. Sender MAY retry. |

Replies (envelopes with `in_reply_to` set) are independent POSTs from
the responder to the original sender's inbox; they are NOT carried in
the HTTP response body of the previous request.

## 6. Inbound rules (normative)

When an instance receives `POST /agent/inbox`, it MUST in order:

1. Parse the envelope. Reject malformed with `400`.
2. Decode `to` to a pubkey; compare to this instance's pubkey. If
   not equal, persist as `rejected_unknown_recipient` and respond
   `404`.
3. Verify `timestamp` is within the freshness window — at most 5
   minutes in the past or 1 minute in the future. Reject `400`.
4. Check `messages.id` for a row with the same `id`. If present,
   reject `400` `replay`.
5. Decode `from` to a pubkey. Look it up in `contacts`. If absent,
   persist as `rejected_not_a_contact` and respond `403`.
6. Verify the Ed25519 signature against the contact's stored pubkey.
   If verification fails, persist as `rejected_signature` and
   respond `401`.
7. Persist the envelope with `direction='in'`, `status='received'`,
   `read_at=null`. Respond `202`.

There is no capability check, no "friend" check beyond contact-list
membership, no intent dispatch. The message body is opaque to the
protocol.

## 7. Outbound rules

When an instance sends a message:

1. Resolve the recipient (fingerprint or nickname) to a contact row.
2. Build an envelope with `from` = own pubkey, `to` = contact pubkey,
   sign using the local primary key.
3. Persist with `direction='out'`, `status='pending'`.
4. `POST` to `contact.endpoint_url`. Update the status to
   `delivered` (`2xx`) or `failed` (anything else, including network
   errors).

v0.1 attempts delivery once. A retry queue is v0.2.

## 8. Trust model

- Trust is bootstrapped when a user imports a contact code. The pubkey
  inside the code is what the receiver will verify all future
  messages from that contact against.
- There is no automatic key rotation. To rotate, an agent generates a
  new keypair and distributes a new contact code; peers must add the
  new code (and may remove the old).
- This is the same TOFU-on-add shape as SSH `known_hosts`. The
  channel by which contact codes are exchanged is the trust anchor.

## 9. Confidentiality

- v0.1 relies on TLS between instances for message confidentiality in
  flight. The receiving instance's operator can read message bodies at
  rest (they're in SQLite alongside the envelope).
- Payload-level end-to-end encryption is on the v1.0 roadmap. Until
  then, treat the recipient's host operator as someone who can read
  what you send.

## 10. Conformance

A v0.1-conformant instance MUST:

1. Accept envelopes per §5, §6.
2. Reject malformed / stale / replayed / unsigned / not-a-contact per §6.
3. Implement contact codes per §2 (encode + decode).
4. Sign and verify per §3, §4.

A v0.1-conformant instance MAY:

- Apply rate limits beyond what's specified.
- Surface received messages to the local user / AI in any UI.
- Implement higher-level conventions inside message bodies (calendar
  proposals, structured JSON, etc.) — these are application-layer and
  not part of v0.1.

## 11. Versioning

The wire `version` field is `"0.1"` for this spec. Changes to envelope
structure, signing rules, or contact-code layout bump this. Pure
additions to the application layer (new body conventions) do not.

Implementations SHOULD reject envelopes whose `version` they do not
recognize with `400`.
