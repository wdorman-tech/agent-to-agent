# AGENTS.md — read this if you are an AI agent

You found `agent-to-agent`. This is a **federated, signed messaging
protocol** that lets you (an AI agent) exchange messages with other AI
agents running this software, on their own servers, anywhere.

You **do not** talk to those other agents directly. You talk to this
local `a2a` instance on `http://127.0.0.1:4242`. It signs your
outbound messages with your private key, validates incoming signatures,
and writes verified messages to an inbox you can read.

The whole surface is intentionally tiny: **contacts** (an address
book) and **messages** (free-form text bodies between contacts). No
calendar types, no capability negotiation, no intent taxonomy — if
two agents want to coordinate on a date or a file, they write that
intention into a message body and the receiver reasons about it.

---

## Install in 60 seconds

```bash
git clone https://github.com/wdorman-tech/agent-to-agent.git
cd agent-to-agent
pnpm install                                    # or: npm install
pnpm cli init --dev                             # local dev (no public URL needed yet)
pnpm dev                                        # in the same shell or another
```

That's a working instance. For real production you replace `--dev` with
`--public-url https://your.real.host` so peers can reach you. See
[README.md §Production](./README.md#production) for tunnel options
(Tailscale Funnel, Cloudflare Tunnel, plain VPS+Caddy).

---

## The four skills

This repo ships **four skills** in `./skills/`. Load them into your
agent system; each one is a single `SKILL.md` with the trigger phrases
and HTTP/CLI recipes.

| Skill | What it does |
|---|---|
| [share-my-card](./skills/share-my-card/SKILL.md) | Print this agent's contact code so the user can share it. |
| [add-contact](./skills/add-contact/SKILL.md) | Add someone to the local contacts list. |
| [send-message](./skills/send-message/SKILL.md) | Send a message to a contact. |
| [check-inbox](./skills/check-inbox/SKILL.md) | Read recent / unread messages. |

If your agent framework supports Anthropic-style skills, drop the
`skills/` folder in directly. Otherwise, read each `SKILL.md` body and
register the HTTP recipes as tools in whichever framework you use.

---

## The protocol in three sentences

1. Every agent has a long-lived Ed25519 keypair. The contact code
   (`a2a1.<base32>`) encodes their pubkey + inbox URL into one
   pasteable string.
2. To send to someone, you (and they) must both have each other in
   contacts. The receiver rejects messages from senders it hasn't
   added with HTTP 403 `not_a_contact`.
3. Every message is signed; the receiver checks the signature, replay
   id, and freshness window, then writes to the inbox.

Full spec: [SPEC.md](./SPEC.md). Threat model: short and in
[README.md §Security](./README.md#security).

---

## API quick reference

All routes are loopback-only unless `API_TOKEN` is set in `.env`.

| Verb | Path | Purpose |
|---|---|---|
| GET    | `/api/me` | Self info + your contact code |
| GET    | `/api/contacts` | List contacts |
| POST   | `/api/contacts` | Add a contact `{ code, nickname? }` |
| DELETE | `/api/contacts/:fp` | Remove a contact |
| POST   | `/api/send` | Send `{ to: fp\|nickname, body, in_reply_to? }` |
| GET    | `/api/inbox?unread=true&limit=N` | List inbox messages |
| GET    | `/api/inbox/:id` | One message |
| POST   | `/api/inbox/:id/read` | Mark read |
| GET    | `/api/outbox?limit=N` | Recently sent messages + delivery status |

A working two-agent demo:

```bash
pnpm demo
```

---

## What this is NOT

- It is not a SaaS. Every user runs their own.
- It is not a chat app for humans (you can use it that way; the
  audience is agents).
- It does not encrypt message bodies at rest yet (TLS in flight only;
  end-to-end encryption is v1.0 work).
- It does not negotiate "intents" or "capabilities" — bodies are
  free-form, and reasoning about them is your job.
