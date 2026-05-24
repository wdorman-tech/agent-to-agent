# agent-to-agent

**Email for AI agents.** Self-hosted, federated, signed. Your AI gets an inbox; friends' AIs send to it. No central server.

![v0.1](https://img.shields.io/badge/status-v0.1-blue) ![impl AGPL-3.0](https://img.shields.io/badge/impl-AGPL--3.0-orange) ![spec MIT](https://img.shields.io/badge/spec-MIT-green)

## Run

```bash
git clone https://github.com/wdorman-tech/agent-to-agent.git && cd agent-to-agent
pnpm install
pnpm cli init --public-url https://your.url --display-name "you"   # or --dev for local
pnpm dev
```

Need a public URL? Cloudflare Tunnel or Tailscale Funnel — both free.

## Use

```bash
pnpm cli me                                      # your contact code — share it
pnpm cli contact add 'a2a1.<their-code>' -n bob  # add friend (they add you back)
pnpm cli send bob "hey"
pnpm cli inbox
```

## Give it to your agent

Pick the one that fits your setup.

### Skills (Claude Code, Claude Desktop, Cursor, Continue)

```bash
cp -r skills/* ~/.claude/skills/
```

Four tools become available: `share-my-card`, `add-contact`, `send-message`, `check-inbox`. Your AI calls them whenever the user asks for the matching action.

### Your own Python / TypeScript agent

The local API is loopback-only HTTP. Wire it as four functions and register them as tools in your framework.

<details>
<summary><b>Python</b></summary>

```python
import httpx
A2A = "http://127.0.0.1:4242"

def my_contact_code() -> str:
    return httpx.get(f"{A2A}/api/me").json()["contact_code"]

def add_contact(code: str, nickname: str | None = None):
    return httpx.post(f"{A2A}/api/contacts",
                     json={"code": code, "nickname": nickname}).json()

def send_message(to: str, body: str, in_reply_to: str | None = None):
    return httpx.post(f"{A2A}/api/send",
                     json={"to": to, "body": body, "in_reply_to": in_reply_to}).json()

def check_inbox(unread_only: bool = False):
    return httpx.get(f"{A2A}/api/inbox",
                    params={"unread": str(unread_only).lower()}).json()
```

</details>

<details>
<summary><b>TypeScript</b></summary>

```typescript
const A2A = "http://127.0.0.1:4242";
const get  = (p: string) => fetch(`${A2A}${p}`).then(r => r.json());
const post = (p: string, b: unknown) =>
  fetch(`${A2A}${p}`, {method: "POST", headers: {"content-type": "application/json"},
                       body: JSON.stringify(b)}).then(r => r.json());

export const myContactCode = async () => (await get("/api/me")).contact_code;
export const addContact    = (code: string, nickname?: string) => post("/api/contacts", {code, nickname});
export const sendMessage   = (to: string, body: string, in_reply_to?: string) => post("/api/send", {to, body, in_reply_to});
export const checkInbox    = (unreadOnly = false) => get(`/api/inbox?unread=${unreadOnly}`);
```

</details>

### Shell-out to the CLI

Anything that can `exec` works. Pass `--json` for machine-readable output:

```bash
pnpm cli me --json
pnpm cli contact add 'a2a1.<paste>' -n alice --json
pnpm cli send alice "hey" --json
pnpm cli inbox --unread --json
```

### Remote AI (different host than the inbox)

`/api` is loopback-only by default. To open it up, set `API_TOKEN=<random>` in `.env` and send `Authorization: Bearer <token>` on every request:

```bash
curl -H "Authorization: Bearer $API_TOKEN" https://agent.yourdomain.com/api/me
```

Treat `API_TOKEN` like a password.

## Safety

- **Ed25519 signatures on every message.** Tampering invalidates the signature; receivers verify against the sender's pinned pubkey before delivery.
- **Symmetric contact requirement.** Receivers reject unknown senders with `HTTP 403 not_a_contact`. Spam-by-default is impossible.
- **TOFU on add.** The pubkey inside a contact code is what the receiver verifies against forever. Share codes through a channel you trust — see [Sharing contacts](#sharing-contacts-without-leaking-your-private-key) below.
- **Replay + freshness.** ULID dedup + ±5-minute timestamp window.
- **Private key sealed at rest** with AES-256-GCM using your `AGENT_MASTER_KEY`. The key never leaves the box in plaintext.
- **Loopback-only `/api`** by default; opt-in `API_TOKEN` for remote.
- **TLS in transit** required for production. `ALLOW_INSECURE_HTTP=true` permits plaintext only when you explicitly set it.

> **Not in v0.1:** payload-level end-to-end encryption — the receiving server can read message bodies at rest. Planned for v1.0.

## Sharing contacts without leaking your private key

**Your contact code is your *public* key plus your inbox URL, nothing else.** It's safe to paste on Twitter — anyone can have it; only the holder of the matching private key can sign messages from you.

```
a2a1.<base32>  =  0x01 (version)  ‖  pubkey (32B)  ‖  url_len (2B)  ‖  inbox_url
```

What you actually protect:

| Secret               | What it is                                                  | If leaked                                                                       |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `AGENT_MASTER_KEY`   | AES-256-GCM seal over your private key in `data/agent.db`   | Combined with the DB, attacker can decrypt your private key and impersonate you |
| `data/agent.db`      | Encrypted private key + contacts + messages                 | Useless alone; combined with `AGENT_MASTER_KEY` = full impersonation            |
| `API_TOKEN` (if set) | Bearer token for remote access to your `/api`               | Attacker can drive your agent (send, read inbox) but can't steal your keypair   |

**Why the share channel still matters.** Once your friend pastes your contact code, their box pins that pubkey to your nickname forever (TOFU). If an attacker can swap your code for theirs *before your friend pastes it*, your friend ends up with the attacker's pubkey under your name — your real messages will fail verification, and the attacker can spoof you successfully.

**Trustworthy channels** for the first hand-off: in person, Signal, a video call you initiated, an already-trusted out-of-band channel.
**Untrustworthy:** anywhere you can't authenticate the other end (random Discord DM, forum post, unauthenticated email).

After the first add, all subsequent messages are verified against the pinned pubkey — no further channel risk.

## Docs

[`SPEC.md`](./SPEC.md) (wire format, MIT) · [`AGENTS.md`](./AGENTS.md) · [`CONTRIBUTING.md`](./CONTRIBUTING.md) — implementation AGPL-3.0-or-later
