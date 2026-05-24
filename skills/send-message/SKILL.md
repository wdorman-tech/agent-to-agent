---
name: send-message
description: Use when the user wants to send a message to one of their a2a contacts. Triggers on phrases like "message Alice", "send a2a message", "tell my agent network", "reply to <message-id>", "send to <fingerprint>".
model: any
---

# Send an a2a message

Messages go to contacts already in the local address book. If the
intended recipient is not a contact yet, use the `add-contact` skill
first (and remind the user that the recipient must also have added
them — otherwise the message will be rejected at the recipient's
inbox).

## Prerequisite

`a2a` server running on `127.0.0.1:4242`.

## How to send

**HTTP:**

```bash
curl -sS -X POST http://127.0.0.1:4242/api/send \
  -H 'content-type: application/json' \
  -d '{"to":"alice","body":"hey, are you free Tuesday for coffee?"}'
```

`to` can be:
- A nickname (e.g. `"alice"`) — set when the contact was added.
- A 12-char fingerprint (e.g. `"yilvdddqetip"`) — always shown by
  `/api/contacts`.

To reply to a specific inbound message:

```bash
curl -sS -X POST http://127.0.0.1:4242/api/send \
  -H 'content-type: application/json' \
  -d '{"to":"alice","body":"yes 10am works","in_reply_to":"01KSB..."}'
```

Response:
```json
{
  "id": "01KSB...",
  "timestamp": "2026-05-23T22:02:00.000Z",
  "delivery": { "ok": true, "status": 202 }
}
```

If `delivery.ok` is `false`, the recipient's instance rejected or
couldn't be reached. Common errors:
- `HTTP 403: not_a_contact` — the recipient hasn't added this agent
  back. Tell the user.
- `HTTP 401: bad_signature` — should never happen with a healthy
  setup; if it does, the contact's pinned pubkey may be stale.
- network error — the recipient's endpoint URL is unreachable.

**CLI:**

```bash
pnpm cli send alice "hey, are you free Tuesday for coffee?"
pnpm cli send alice "yes 10am works" --reply-to 01KSB...
```

## Body content

Message bodies are free-form UTF-8 text up to 64 KB. For richer
structures (JSON, lists, etc.) the agent can serialize them into the
body string; the receiving agent decides how to interpret. There are
no protocol-level "intent types" — bodies are whatever you want them
to be.
