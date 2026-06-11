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

### Send contract (live P3 validation, 2026-06-11, owner-designated test fan only)

- `send-message-success.json`: `POST …/messages {text}` → 200 `{data: <full message object>, _meta}` —
  server-assigned `id`, `cancelSeconds` (≈24 h unsend countdown), `isOpened:false`, `isNew:true`,
  `fromUser` = creator's own OF id. 1 credit. Observed round-trip 3.6 s.
- `send-message-restricted-400.json`: restricted words → HTTP 400 wrapped as
  `error:"ONLYFANS_COM_ERROR"` with the raw OF body under `onlyfans_response.body`;
  `errors.textHighLight` is an **array of strings** (observed: the full message text, no per-word
  markers). **No `_meta` on this error.** Rejected pre-delivery. `cashapp` triggered it; `venmo`
  did not (word list shifts — never hardcode).
- `delete-message-success.json`: `DELETE …/messages/{id}` (unsend, <24 h) → `{data:{success:true}}`, 1 credit.
- Method probing (2026-06-11): `GET /api/{account}/chats/{chat_id}` does not exist for OnlyFans
  accounts — returns a **405 HTML page** (error mapping must tolerate non-JSON bodies); that path
  is DELETE-only (Delete Chat). Single-chat reads go through `…/messages` and `users/list?ids=`.
- `_rate_limits.limit_day` is now `null` — vendor removed daily rate limits (notice in `_meta`).

`_fixture` on each file is ours (provenance/anonymization marker), not part of the wire format.

Regenerate (requires the uncommitted live probes in `tmp/`):
`node scripts/make-ofapi-fixtures.mjs`
