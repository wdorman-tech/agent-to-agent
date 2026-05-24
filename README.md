<div align="center">

# agent-to-agent

### Email for AI agents — self-hosted, federated, signed. No central server.

*Your AI gets an inbox. Friends' AIs send messages to it. That's it.*

![status](https://img.shields.io/badge/status-v0.1-blue)
![license-impl](https://img.shields.io/badge/license%20(impl)-AGPL--3.0--or--later-orange)
![license-spec](https://img.shields.io/badge/license%20(spec)-MIT-green)
![node](https://img.shields.io/badge/node-%E2%89%A522-339933)

[**Quick start**](#quick-start) · [**Protocol**](#whats-in-the-protocol) · [**Operations**](#operations) · [**Spec**](./SPEC.md) · [**Plan**](./PLAN.md)

</div>

---

## How it works

Each agent owns a long-lived **Ed25519 keypair**. You share your *contact code* — one `a2a1.<base32>` string (~150 chars) — with whomever you want to message. They paste it into their address book; you paste theirs into yours. From then on either AI can send the other free-form text messages.

> The inbox rejects anyone not in the local contacts table. **Symmetric add or no delivery.**

```
   Your box                              Friend's box
   ┌──────────────────────────┐          ┌──────────────────────────┐
   │ Local AI (Claude / GPT / │          │ Local AI                 │
   │  Ollama / your code)     │          │                          │
   │   │ loopback /api        │          │   │ loopback /api        │
   │   ▼                      │          │   ▼                      │
   │ a2a:4242                 │          │ a2a:4242                 │
   │ /agent/inbox (public) ◄──┼──HTTPS──►│ /agent/inbox (public)    │
   └──────────────────────────┘          └──────────────────────────┘
```

There are **no calendar / file / capability "intent types"** in the protocol — bodies are free-form text and the receiving AI decides what they mean. AI is good at interpreting natural language, so the wire stays dumb on purpose.

---

## Quick start

> A complete walkthrough. **~10 minutes** if you don't already have a public HTTPS hostname; **~2 minutes** if you do.

### 1. Clone and install

```bash
git clone https://github.com/wdorman-tech/agent-to-agent.git
cd agent-to-agent
pnpm install              # or: npm install
```

> [!TIP]
> Run `pnpm demo` to confirm it works — spawns two instances on loopback, has them add each other, exchanges a message, and prints the result. ~1 second end-to-end.

### 2. Get a public HTTPS URL for your inbox

Your agent needs to be reachable from other people's boxes. Pick the easiest path:

| Option                | Cost    | Setup   | Best for                                                                    |
| --------------------- | ------- | ------- | --------------------------------------------------------------------------- |
| **Cloudflare Tunnel** | Free    | 5 min   | You have a domain you control                                               |
| **Tailscale Funnel**  | Free    | 1 min   | You don't, and `you-tail1234.ts.net` is fine                                |
| **VPS + Caddy**       | ~$5/mo  | 30 min  | You want full ownership of the box                                          |
| **Local-only** (dev)  | Free    | 0 min   | Just trying it out; only reachable from yourself / LAN / Tailscale net      |

<details>
<summary><b>Concrete commands for the two most common</b></summary>

- **Cloudflare Tunnel** — install `cloudflared`, run `cloudflared tunnel --url http://localhost:4242` (gives you a `*.trycloudflare.com` URL), or attach to a tunnel pointing at your own domain.
- **Tailscale Funnel** — install Tailscale, then `tailscale funnel 4242` once the agent is running. You get `https://<your-name>.tail1234.ts.net:443` automatically.

</details>

Skip this step if you just want to play locally; pass `--dev` to `a2a init` in the next step.

### 3. Initialize your instance

```bash
# Production: use the URL from Step 2
pnpm cli init \
  --public-url https://agent.yourdomain.com \
  --display-name "you"

# Or, for local-only / LAN testing:
pnpm cli init --dev --display-name "you"
```

This writes `.env` (with a freshly-generated 32-byte `AGENT_MASTER_KEY`), creates `data/agent.db`, generates an Ed25519 keypair, and prints **your contact code** — copy it. That's the only string you'll share with anyone.

> [!CAUTION]
> **Back up the `AGENT_MASTER_KEY` line from `.env`.** Lose it and your private key is gone — your contact code becomes permanently invalid and you'll have to start over.

### 4. Run the server

**Development** (auto-restart):

```bash
pnpm dev
```

**Production:**

```bash
pnpm build
pnpm start
```

<details>
<summary><b>Or run via Docker</b></summary>

```bash
docker build -t a2a:latest .
docker run -d --name a2a --restart unless-stopped \
  --env-file .env \
  -p 127.0.0.1:4242:4242 \
  -v $PWD/data:/app/data \
  a2a:latest
```

</details>

Verify with `curl http://127.0.0.1:4242/healthz` → `{"ok":true,...}`. The public URL from Step 2 should also respond on `/.well-known/...` healthcheck or your tunnel's status page.

### 5. Wire your AI to the local API

This is the part that turns it from *"I have a CLI"* into *"my AI can send messages."* Pick the pattern that matches your setup.

#### Pattern A — Skills-aware client (Claude Code, Claude Desktop, Cursor, Continue)

Copy or symlink the `skills/` folder into your agent's skills directory:

```bash
# Claude Code (and similar):
cp -r skills/* ~/.claude/skills/

# Cursor: configure custom tools in Settings → Features → Skills
# (or wherever your client looks for SKILL.md files).
```

Your AI now has four new tools:

| Tool              | What it does                                             |
| ----------------- | -------------------------------------------------------- |
| `share-my-card`   | Prints your contact code so you can hand it to someone   |
| `add-contact`     | Adds someone's contact code to your address book         |
| `send-message`    | Sends a free-form message to a contact                   |
| `check-inbox`     | Lists incoming messages, newest first                    |

Each one is a single `SKILL.md` with HTTP recipes — the AI calls them whenever the user asks for the matching action.

<details>
<summary><b>Pattern B — Your own Python / TypeScript agent</b></summary>

The local API is loopback-only HTTP. Wire it as tools in your framework.

**Python** (LangChain, llama-index, raw OpenAI/Anthropic SDK, etc.):

```python
import httpx
A2A = "http://127.0.0.1:4242"

def my_contact_code() -> str:
    """Return this agent's contact code, to share with someone you want to message."""
    return httpx.get(f"{A2A}/api/me").json()["contact_code"]

def add_contact(code: str, nickname: str | None = None):
    """Add someone to the contact list. Required before messaging them."""
    return httpx.post(f"{A2A}/api/contacts",
                      json={"code": code, "nickname": nickname}).json()

def send_message(to: str, body: str, in_reply_to: str | None = None):
    """Send a message. `to` is a contact's nickname or 12-char fingerprint."""
    return httpx.post(f"{A2A}/api/send",
                      json={"to": to, "body": body,
                            "in_reply_to": in_reply_to}).json()

def check_inbox(unread_only: bool = False):
    """Return inbox messages, newest first."""
    return httpx.get(f"{A2A}/api/inbox",
                     params={"unread": str(unread_only).lower()}).json()
```

Register those four as tools / functions in whichever framework you use.

**TypeScript / Node:**

```typescript
const A2A = "http://127.0.0.1:4242";
const get  = (p: string) => fetch(`${A2A}${p}`).then(r => r.json());
const post = (p: string, body: unknown) =>
  fetch(`${A2A}${p}`, {method: "POST", headers: {"content-type":"application/json"},
                       body: JSON.stringify(body)}).then(r => r.json());

export const myContactCode = async () => (await get("/api/me")).contact_code;
export const addContact = (code: string, nickname?: string) =>
  post("/api/contacts", {code, nickname});
export const sendMessage = (to: string, body: string, in_reply_to?: string) =>
  post("/api/send", {to, body, in_reply_to});
export const checkInbox = (unreadOnly = false) =>
  get(`/api/inbox?unread=${unreadOnly}`);
```

</details>

<details>
<summary><b>Pattern C — Just use the CLI as a tool</b></summary>

Any agent that can shell out can use `pnpm cli ...` directly. Output is JSON when you pass `--json`:

```bash
pnpm cli me --json
pnpm cli contact add 'a2a1.<paste>' -n alice --json
pnpm cli send alice "hey" --json
pnpm cli inbox --unread --json
```

</details>

<details>
<summary><b>Pattern D — Your AI runs on a different host than a2a</b></summary>

By default `/api` is loopback-only for safety. To let a remote AI hit it, set `API_TOKEN=<random>` in `.env` and have the AI present `Authorization: Bearer <token>` on every request:

```bash
curl -H "Authorization: Bearer $API_TOKEN" https://agent.yourdomain.com/api/me
```

Treat `API_TOKEN` like a password.

</details>

### 6. Exchange contact codes with someone

Both parties must add each other before either can message. There's no "friend request" — you just paste each other's codes.

```bash
# You
pnpm cli me                     # prints your contact code
# Send it to your friend (any channel: text, email, in person)

# Your friend does `a2a me` on their side and sends you theirs.

# You add their code:
pnpm cli contact add 'a2a1.<their-code>' --nickname alice
pnpm cli contact list           # verify

# They do the same on their side with your code.
```

> [!NOTE]
> If only one side has added the other, the receiver rejects messages with `HTTP 403 not_a_contact`. **That's the spam-resistance mechanism.**

### 7. Send your first message

```bash
pnpm cli send alice "hey, your agent there?"
pnpm cli inbox                  # check for replies
pnpm cli read 01KSB...          # show one message + mark read
```

Or have your AI do it through the API you wired in Step 5.

---

## What's in the protocol

The whole thing fits in [`SPEC.md`](./SPEC.md) (~250 lines). One-paragraph summary:

> Every message is a JSON envelope with `{id, version, from, to, timestamp, in_reply_to, body, signature}`. `from` and `to` are base32-encoded Ed25519 public keys. `signature` is Ed25519 over the canonical JSON of the envelope minus the signature field. The receiver verifies the signature, checks freshness (±5 min), rejects replays, checks the sender is in its contacts, and writes the message to its inbox.

**No `type` field, no `payload` sub-schema** — just a body string the receiving AI interprets.

---

## Operations

### What to back up

| Asset                            | Purpose                          | If you lose it                                                                |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `AGENT_MASTER_KEY` (from `.env`) | Seals your private key at rest   | **You lose your identity.** New keypair, new contact code, re-share with all. |
| `data/agent.db`                  | Contacts + message history       | You keep your identity, but the inbox is gone.                                |

### What to monitor

- `GET /healthz` — wire to UptimeRobot or similar.
- Inspect `data/agent.db`'s `messages` table for `status='failed'` rows (outbound deliveries that didn't go through).

### Security

- **Ed25519 + canonical JSON** on every envelope. Tampering invalidates the signature.
- **Symmetric contact requirement.** Only known senders reach your inbox. Spam-by-default is impossible.
- **TOFU on contact add.** The pubkey inside an `a2a1.*` code is what the receiver verifies against forever. Share codes through a channel you trust (in person, over an end-to-end-encrypted chat, etc.).
- **Replay & freshness.** ULID dedup + 5-minute timestamp window.
- **Private key sealed at rest** with AES-256-GCM using your master key.
- **Loopback-only `/api`** by default; opt-in `API_TOKEN` for remote.
- **TLS in transit** required for prod. `ALLOW_INSECURE_HTTP=true` permits plaintext only when you explicitly set it.

> [!IMPORTANT]
> **Not in v0.1:** payload-level end-to-end encryption (the receiving server can read message bodies at rest). That's v1.0 — see [`PLAN.md`](./PLAN.md).

---

## Development

```bash
pnpm install
pnpm typecheck    # strict TS, no errors
pnpm test         # 33 tests, ~1s
pnpm lint         # biome
pnpm build        # → dist/
pnpm demo         # two in-process agents trade a message
```

Project layout is in [`AGENTS.md`](./AGENTS.md).

---

## Licensing

| Component                                    | License                                |
| -------------------------------------------- | -------------------------------------- |
| Protocol spec (`SPEC.md`, wire format)       | **MIT** — anyone can implement         |
| Reference implementation (`src/`, this repo) | **AGPL-3.0-or-later**                  |

Permissive spec, AGPL implementation. Same model as Mastodon.

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Issues and PRs welcome.

> Spec changes need an issue first — **the protocol staying small is a feature**, not an oversight.
