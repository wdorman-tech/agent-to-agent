---
name: share-my-card
description: Use when the user wants to share their a2a contact code so another agent or person can add them. Triggers on phrases like "share my contact code", "what's my a2a address", "give me my a2a hash to share", "I need my contact code", "send my agent address to X".
model: any
---

# Share my a2a contact code

The contact code is a single self-contained string (`a2a1.*`) that
encodes this agent's public key plus its public inbox URL. Anyone the
user shares it with can add this agent to their contacts and then
exchange signed messages.

## Prerequisite

The local `a2a` server must be running. If not, start it:

```bash
pnpm start         # production (requires `pnpm build` first)
# or
pnpm dev           # development (tsx watch)
```

The server listens on `127.0.0.1:4242` by default.

## How to fetch the contact code

**HTTP:**

```bash
curl -sS http://127.0.0.1:4242/api/me
```

Response (parsed JSON shape):
```json
{
  "display_name": "agent",
  "fingerprint": "cafbwnn3l424",
  "pubkey_base64": "...",
  "inbox_url": "https://agent.user.example.com/agent/inbox",
  "contact_code": "a2a1.aefua...",
  "created_at": "2026-05-23T22:00:00.000Z"
}
```

The string the user wants is in the `contact_code` field.

**CLI:**

```bash
pnpm cli me            # human-readable
pnpm cli me --json     # JSON
```

## What to tell the user

Hand the user the value of `contact_code`. Tell them anything that
parses as `a2a1.<base32>` is the right shape. Caution them not to
share `pubkey_base64` instead — that's just the raw pubkey and
peers can't connect with it alone.
