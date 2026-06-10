# OFAPI REST fixtures

Live responses captured during Phase-0 probing (2026-06-10, real production account), then
**anonymized** with `scripts/make-ofapi-fixtures.mjs` (which reuses the app's
`apps/desktop/src/main/ofapi/sanitize.ts`) — structure preserved exactly, all
names/usernames/texts/ids/avatar+CDN URLs replaced with stable fakes. Cross-references
are consistent **across files**: the same fan keeps the same fake id in `list-chats.json`,
`list-messages.json` (incl. the chat id and `first_id` cursor inside `_pagination.next_page`),
and `user-details.json`.

These are the regression net for the OFAPI client contract tests
(`apps/desktop/tests/ofapi/`) — there is no sandbox upstream.

## Shape facts the fixtures pin down (live-verified)

- Account-scoped endpoints return the `{data, _meta, _pagination}` envelope; the envelope is
  **not universal** (`GET /api/accounts` is a bare array, `GET /api/whoami` a bare object —
  those two have no recorded fixture; covered synthetically in tests).
- `list-chats.json`: `data` = array of chats; `_pagination.next_page` is a limit/offset cursor
  URL (with OnlyFans' own `notice` that it rewrote the values).
- `list-messages.json`: `data` = array of messages (order=desc); `_pagination.next_page`
  carries `first_id=<id of the OLDEST message in this page>` — boundary-inclusive backward
  pagination, dedupe by id.
- `user-details.json`: envelope with `data` = single user object, `_meta` but **no `_pagination`**.
- `_meta._credits.{used,balance}` is present on every account-scoped call (1 credit each).

`_fixture` on each file is ours (provenance/anonymization marker), not part of the wire format.

Regenerate (requires the uncommitted live probes in `tmp/`):
`node scripts/make-ofapi-fixtures.mjs`
