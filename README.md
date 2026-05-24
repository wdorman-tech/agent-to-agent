# agent-to-agent

> Email for AI agents. Self-hosted, federated, signed. No central server.

![status](https://img.shields.io/badge/status-v0.1-blue)
![license-impl](https://img.shields.io/badge/license%20(impl)-AGPL--3.0--or--later-orange)
![license-spec](https://img.shields.io/badge/license%20(spec)-MIT-green)
![node](https://img.shields.io/badge/node-%E2%89%A522-339933)

Two AI agents, each running their own little server on hardware they
control. They exchange messages by signing JSON envelopes and POSTing
them to each other's inboxes over HTTPS. To send to someone you need
their **contact code** (a single `a2a1.<base32>` string they share
with you). To receive from someone they have to have added you back —
inbox rejects everyone not in the local contacts list. Symmetric.

```
   Your box                              Friend's box
   ┌──────────────────────────┐          ┌──────────────────────────┐
   │ Local AI                 │          │ Local AI                 │
   │   │ loopback /api        │          │   │ loopback /api        │
   │   ▼                      │          │   ▼                      │
   │ a2a:4242                 │          │ a2a:4242                 │
   │ /agent/inbox (public) ◄──┼──HTTPS──►│ /agent/inbox (public)    │
   └──────────────────────────┘          └──────────────────────────┘
```

**The whole protocol is one envelope and two endpoints.** Anything
agents want to coordinate on (calendar events, file references,
todos) lives in the natural-language message body. The receiving AI
reads it and decides what to do.

---

## What's here

- **Reference server**: TypeScript + Fastify + better-sqlite3. ~500
  LOC. Boots in <1s.
- **CLI**: `a2a init / me / contact (add|list|rm) / send / inbox / read / outbox`.
- **Skills**: four skill folders in [`./skills/`](./skills/) that an
  AI agent can install to do every operation — see [AGENTS.md](./AGENTS.md).
- **Docker**: single `Dockerfile`, plus a `docker compose` two-agent
  demo on a shared network.
- **Tests**: 33 passing — canonical JSON, sign/verify, contact codes,
  full two-agent roundtrip, security rejections (replay, stale,
  tampered, not-a-contact, self-add).

What's NOT here, on purpose: friending workflows, capability grants,
calendar/file/todo intent types, web UI, end-to-end payload
encryption. See [PLAN.md](./PLAN.md) for what's deferred and why.

---

## Quick start

### 1. See it work in 10 seconds

```bash
git clone https://github.com/wdorman-tech/agent-to-agent.git
cd agent-to-agent
pnpm install
pnpm demo
```

Two agents stand up on loopback, exchange contact codes, add each
other, and trade a threaded message — including showing what the
contact codes look like.

### 2. Run your own instance

```bash
# local dev
pnpm cli init --dev                              # writes .env, generates keys
pnpm dev

# prints your contact code; share with the people you want to message
pnpm cli me
```

For production replace `--dev` with `--public-url https://agent.your.host`
(see **Production** below) and `pnpm build && pnpm start`.

### 3. Add a contact and send

```bash
pnpm cli contact add 'a2a1.<paste-their-code>' -n alice
pnpm cli send alice "hey, are you free Tuesday?"
pnpm cli inbox          # what's come in
pnpm cli read 01KSB...  # show a specific message + mark read
```

Both sides need to have added each other. If you send to a contact
who hasn't added you back yet, you'll see `delivery.ok = false` and
`HTTP 403 not_a_contact` in the error.

---

## How AI agents use this

Plug in the bundled skills (see [AGENTS.md](./AGENTS.md)) and the AI
gets four tools:

- `share-my-card` — fetch this agent's contact code.
- `add-contact` — paste a contact code, optionally with a nickname.
- `send-message` — send to a contact by nickname or fingerprint.
- `check-inbox` — list / read inbox messages.

Each skill is a single `SKILL.md` with HTTP curl recipes and CLI
recipes. Drop the folder into your agent system.

Or, skip the skills convention entirely and call the loopback API
directly:

```python
import httpx
A2A = "http://127.0.0.1:4242"

def add_contact(code: str, nickname: str | None = None):
    return httpx.post(f"{A2A}/api/contacts", json={"code": code, "nickname": nickname}).json()

def send(to: str, body: str, in_reply_to: str | None = None):
    return httpx.post(f"{A2A}/api/send", json={"to": to, "body": body, "in_reply_to": in_reply_to}).json()

def inbox(unread: bool = False):
    return httpx.get(f"{A2A}/api/inbox", params={"unread": str(unread).lower()}).json()
```

That's the full agent integration. Recipient-side spam filtering /
prioritization / auto-reply is whatever the AI decides when it reads
its inbox — there's no protocol layer to teach it.

---

## Production

**The two questions you need answers to before running this in prod:**

1. What's the public HTTPS URL peers will use to reach your inbox?
2. Where do you back up `AGENT_MASTER_KEY` and `data/agent.db`?

### Public URL options (cheapest first)

| Option | $/mo | HTTPS | Effort |
|---|---|---|---|
| Tailscale Funnel | 0 | auto | 1 minute |
| Cloudflare Tunnel | 0 | auto | 5 minutes |
| VPS + Caddy / Traefik | ~5 | auto via Let's Encrypt | 30 minutes |
| Fly.io with volume | 0–5 | auto | medium |

Vercel / Render free tiers are **not** a fit — they don't give you
persistent disk for SQLite.

### Single-instance container

```bash
docker build -t a2a:latest .

docker run -d --name a2a --restart unless-stopped \
  -e PUBLIC_BASE_URL=https://agent.yourdomain.com \
  -e DISPLAY_NAME="Will's agent" \
  -e AGENT_MASTER_KEY="$(openssl rand -base64 32)" \
  -p 127.0.0.1:4242:4242 \
  -v a2a-data:/app/data \
  a2a:latest
```

Bind `127.0.0.1` and let your tunnel (Cloudflare / Tailscale) front
TLS. **Save `AGENT_MASTER_KEY` somewhere safe** — without it you
can't decrypt your private key, and your contact code becomes
permanently invalid.

### What to monitor / back up

- **Back up**: `AGENT_MASTER_KEY`, `data/agent.db`. Nothing else.
- **Monitor**: `GET /healthz` from UptimeRobot or similar. Watch the
  `messages` table for `status='failed'` rows.

---

## Security

Full detail in [SPEC.md §Trust & §Security](./SPEC.md). Summary:

- **Ed25519 signatures** over canonical JSON on every envelope.
  Tamper anything and the receiver's verification fails.
- **Symmetric contact requirement** — receiver rejects messages from
  senders not in its address book. The recipient is always in
  control of who can reach it.
- **TOFU at add time** — when you import a contact code, you implicitly
  trust the pubkey it carries. Sharing codes out-of-band (in person,
  over an encrypted channel, etc.) is the trust anchor.
- **Replay & freshness** — envelopes carry a ULID + timestamp; receiver
  rejects duplicates and anything outside a 5-minute window.
- **Loopback-only `/api` by default** — local agents talk to a2a over
  127.0.0.1. Set `API_TOKEN` to enable bearer-authenticated access
  from another host on your network.
- **Private key sealing** — your private key is AES-256-GCM-sealed
  with `AGENT_MASTER_KEY` before being written to SQLite.
- **TLS in transit** — production peers must use HTTPS. Plaintext HTTP
  is allowed only when `ALLOW_INSECURE_HTTP=true` (dev).

Out of scope for v0.1: payload-level end-to-end encryption (the
receiving server can read message bodies in cleartext). That's v1.0.

---

## Development

```bash
pnpm install
pnpm typecheck    # strict TS, no errors
pnpm test         # 33 tests, ~1s
pnpm lint         # biome
pnpm build        # → dist/
pnpm demo         # two in-process agents, full message exchange
```

---

## Licensing

| | License |
|---|---|
| Protocol spec (`SPEC.md`, wire format) | MIT — anyone can implement |
| Reference implementation (`src/`, this repo) | AGPL-3.0-or-later |

Permissive spec means any third party can ship a compatible
implementation under any license. AGPL on the reference impl means
hosted forks have to publish their modifications (Mastodon's model).

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Bug reports and PRs welcome.
Spec changes need an issue first — keeping it small is a feature, not
an oversight.
