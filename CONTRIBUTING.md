# Contributing

This is a small project on purpose. A few guidelines keep it that way.

## Bugs

Open an issue with:
- What you did (commands / inputs / env — never paste real keys).
- What happened (error message, partial output).
- What you expected.

For security issues, email instead of filing publicly. See [Security](#security).

## PRs

For non-trivial changes, open an issue first so we can talk about
shape.

For bug fixes and small improvements, a PR is welcome directly. Please:

- Run `pnpm typecheck && pnpm test && pnpm lint` locally; all three
  must be clean.
- Keep the change focused. Refactor + feature work in separate PRs.
- Add a test for any behavior change. The security paths (sign /
  verify, replay, contact membership, freshness) must always be
  covered.
- Conventional commits (`fix:`, `feat:`, `docs:`, `chore:`, etc.).

## Spec changes

Modifying [SPEC.md](./SPEC.md) is a wire-format change. Bump the
protocol version in the PR description and explain backward
compatibility. New body conventions are not wire-format changes — they
live in user-space.

The protocol is small on purpose. If you want to add a "type" or
"capability" or "intent" system to envelopes, please re-read the
v0.1 history first; we already tried that.

## Style

- TypeScript strict mode. Avoid `any`; if necessary, add a comment
  explaining why.
- Biome handles format and lint. Run `pnpm format`.
- Plain functions and small modules > classes, unless there's
  lifecycle state (e.g. `Outbox`, `Router`).
- Comments explain *why*, not *what*.
- New dependencies need discussion — the surface area is intentionally
  tiny.

## Security

- Never `console.log` private keys or sealed material.
- Treat inbound bytes as hostile until they've passed the router's
  signature + freshness + contact + recipient checks.
- Report security issues privately to the maintainer email in
  [package.json](./package.json).
