---
name: add-contact
description: Use when the user wants to add someone to their a2a contact list — typically by pasting an `a2a1.*` contact code they received. Triggers on phrases like "add this contact", "add a2a1...", "save this hash", "add Alice to my contacts", "import this contact code".
model: any
---

# Add a contact to the local a2a address book

Adding someone to contacts is required in two ways:
1. To **send** them messages.
2. To **receive** messages from them. The receiver enforces a
   symmetric rule: incoming messages from senders not in the local
   contacts list are rejected with HTTP 403 `not_a_contact`.

So tell both parties they must each add the other before either can
exchange messages.

## Prerequisite

`a2a` server running on `127.0.0.1:4242`.

## How to add

Expect the user to provide an `a2a1.*` string (the contact code). If
they paste anything else, ask for the full code.

**HTTP:**

```bash
curl -sS -X POST http://127.0.0.1:4242/api/contacts \
  -H 'content-type: application/json' \
  -d '{"code":"a2a1.<paste>","nickname":"alice"}'
```

Nickname is optional but recommended — it lets the user (and you)
refer to the contact by name later. If omitted, only the
fingerprint (12-char id like `yilvdddqetip`) is shown.

Response (201):
```json
{
  "fingerprint": "yilvdddqetip",
  "nickname": "alice",
  "endpoint_url": "https://alice.example.com/agent/inbox",
  "added_at": "2026-05-23T22:01:00.000Z",
  "last_seen_at": null,
  "pubkey_base64": "..."
}
```

Possible errors:
- `400 bad_contact_code` — the code didn't decode. Ask the user to
  paste the entire `a2a1.*` string.
- `400 self` — the code is this agent's own. Refuse and explain.

**CLI:**

```bash
pnpm cli contact add 'a2a1.<paste>' -n alice
pnpm cli contact list
```

## After adding

If the user added a contact in order to message them, remind the user
that the contact must also add the user back, or messages won't get
through.
