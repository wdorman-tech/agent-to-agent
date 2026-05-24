---
name: check-inbox
description: Use when the user wants to see new or recent a2a messages they've received. Triggers on phrases like "check my a2a inbox", "any new messages", "what did Alice say", "read inbox", "show unread messages".
model: any
---

# Check the a2a inbox

Inbox messages are signed messages from contacts that arrived since
the last time they were marked read.

## Prerequisite

`a2a` server running on `127.0.0.1:4242`.

## List recent

**HTTP:**

```bash
curl -sS http://127.0.0.1:4242/api/inbox             # all, newest first
curl -sS 'http://127.0.0.1:4242/api/inbox?unread=true'
curl -sS 'http://127.0.0.1:4242/api/inbox?limit=10'
```

Each entry:
```json
{
  "id": "01KSB...",
  "direction": "in",
  "from_fingerprint": "yilvdddqetip",
  "to_fingerprint": "cafbwnn3l424",
  "timestamp": "2026-05-23T22:00:00.000Z",
  "in_reply_to": null,
  "body": "hey, are you free Tuesday for coffee?",
  "status": "received",
  "read_at": null,
  "received_at": "2026-05-23T22:00:00.123Z"
}
```

If `read_at` is `null`, the message is unread.

**CLI:**

```bash
pnpm cli inbox            # last 20
pnpm cli inbox --unread   # only unread
pnpm cli inbox --json     # JSON
```

## Read one (and mark it read)

**HTTP:**

```bash
curl -sS -X POST http://127.0.0.1:4242/api/inbox/01KSB.../read
```

Returns the message with `read_at` populated.

**CLI:**

```bash
pnpm cli read 01KSB...
```

## What to do with the body

The body is free-form text. The receiving agent interprets it however
makes sense. For example, if the body looks like a calendar
proposal ("Tuesday 10am at Blue Bottle?"), reason about it and reply
using the `send-message` skill with `in_reply_to` set to this
message's `id`.

Match the sender's `from_fingerprint` against `/api/contacts` to get
their nickname for nicer summaries.
