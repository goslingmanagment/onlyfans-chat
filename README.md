# ChatGoose Desktop

Electron workspace for OnlyFans agency chatters: inbox, conversations, PPV/media
sending, fan intelligence, spenders workflows, and AI-assisted drafting in one
keyboard-first application.

## Current architecture

The desktop is a client of the Agency Hub kernel in `../hub`:

- all OnlyFans/OFAPI reads go through core's read gateway;
- text, typing, unsend, mark-read, and media writes go through core's command
  outbox/executor;
- live updates arrive through core's webhook-backed SSE stream and snapshots;
- AI generations use the kernel feature lane; provider keys, models, prompts,
  quota enforcement, and cost accounting live in core;
- the desktop authenticates with a per-device token and stores its local database
  and media cache encrypted at rest.

There is no supported Direct OFAPI/provider-key fallback on the chatter machine.
The last pre-kernel PRD/SPEC/PLAN phases remain useful historical context but are
not current architecture truth.

The shipped app version is `apps/desktop/package.json`; Git tags and the served
auto-update feed determine release state. Do not copy a current-version claim
from prose.

## Documentation

- [AGENTS.md](AGENTS.md) — binding engineering and safety rules;
- [docs/decisions.md](docs/decisions.md) — decision log D1–D45, frozen on
  2026-10-20; new decisions live in PR descriptions;
- [docs/RELEASE.md](docs/RELEASE.md) — current Windows build/release procedure;
- [docs/WINDOWS-VERIFICATION.md](docs/WINDOWS-VERIFICATION.md) — helper checklist
  using Agency Hub device sign-in;
- `docs/generated/` — point-in-time maps; verify their snapshot SHA before use;
- `docs/PRD.md`, `docs/SPEC.md`, `docs/PLAN.md`, and `docs/DESIGN.md` — mixed
  historical product/design material. Current code and decisions win on any
  architecture or transport conflict;
- `docs/SESSIONS.md` — historical build-session prompts plus the retained
  fail-closed live-send/test-fan safety protocol. Do not replay completed phases.

## Development

Requirements: Node.js 22+, pnpm, and Docker where integration tests require it.

```bash
pnpm install
pnpm check
pnpm --filter @chatgoose/desktop dev
```

`pnpm check` runs typecheck, lint, unit tests, and builds. Release artifacts are
created through the repository's Windows workflow or the commands documented in
`docs/RELEASE.md`.

AI output is always a draft. Never auto-retry an indeterminate send and never
send to a real fan during testing; live-send checks are limited to the explicitly
configured owner-controlled test fan and fail closed when it is absent.
