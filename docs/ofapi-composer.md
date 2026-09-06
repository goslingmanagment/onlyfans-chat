# OFAPI composer and conversation actions

Implemented 2026-09-06; desktop decision D27, Hub decision 268. These are local
implementation and test results, not a production rollout claim.

The message composer sends `send_message_v2`. Prices accept exactly two decimal
places, including $6.97, and persist integer cents; paid messages remain $3–$200.
Caption locking is explicit and defaults to visible. Reply, GIF and the three
release-reference arrays are optional, exact IDs. Previews remain a subset of
selected media. Existing queued v1 rows keep their original contract and recovery.

Open **Message options** for caption locking, provider screening, GIF/reference
lookup and verified creator/partner/guest IDs. Reply selects the exact message ID.
The local banned-word preview uses Hub's stored dictionary and literal matches;
missing or partial dictionaries are labelled. It never changes text. Provider
screening is explicit: `strict_ban` covers all three tiers; `risky` covers risky
and replace/soften; `replace_soften` covers only that tier. No selection means
preview only.

A provider 422 keeps text, references, price, attachments and previews in the
outbox, with a bounded provider explanation. A just-submitted failed draft is
restored automatically only while the composer is empty. **Edit** restores the
retained rich draft only into a clear composer; an existing draft is preserved.
**Check now** asks Hub for status. **Recover with original key…** requires an
explicit confirmation and an unchanged saved payload. Hub checks the original
24-hour window, account, endpoint, body and media-token ownership. Delivery may
already have happened. No scheduler, boot reconciliation or network error
initiates a new provider send. Similar local message text cannot confirm v2.

The chat menu supplies OnlyFans custom name, unread, mute/unmute and hide; message
buttons supply like/unlike and pin/unpin. These are closed Hub commands. The
client intent is saved before intake; double clicks share one command. Unknown
outcomes keep that identity across restarts. **Check status** recovers the same
intent, and changing the same setting stays blocked until it is resolved.
Confirmed actions update local state; failed/unknown ones remain visible. Hiding
removes the chat from local lists while retaining its cached messages. Like/pin/
mute state reflects this desktop's confirmed actions and is retained independently
of the recent-history window; it is not a claim to observe every external edit.

## Reference lookup and documentation differences

Lookups run only on **Load one page**, through the authenticated Hub read gateway:

| Choice | Method/path | Query |
|---|---|---|
| Giphy | `GET /{account}/giphy/trending` or `/giphy/search` | `limit=20`; search requires `q` |
| Release forms | `GET /{account}/release-forms` | `limit=20`, optional `name` |
| Taggable users | `GET /{account}/release-forms/taggable-users` | `limit=20`, optional `name` |

Live [Giphy trending](https://docs.onlyfansapi.com/api-reference/giphy/list-trending-gi-fs)
and [search](https://docs.onlyfansapi.com/api-reference/giphy/search-gi-fs) return
`data[]`; their examples do not establish a continuation or complete catalog.
[Release forms](https://docs.onlyfansapi.com/api-reference/release-forms/list-release-forms)
and [taggable users](https://docs.onlyfansapi.com/api-reference/release-forms/list-taggable-users)
return `data.items` and `_pagination.next_page`. Missing continuation is unknown
coverage; a malformed body is an error. No separate partners/guests endpoint was
verified. The UI displays form and partner references but never substitutes a form
ID for a person/partner/guest ID. The verified Hub send contract uses arrays for
`rfTag/rfPartner/rfGuest` despite scalar labels in the vendor's field schema.

## Rollout and spend

1. Deploy the completed Hub OFAPI review stack through PR #142, then release
   this desktop build using the normal release procedure. The release gate must
   observe the exact SDK contract hash below on the deployed Hub; deploying only
   the earlier S6 batch is insufficient for this final SDK snapshot.
2. No collector is enabled by installing the desktop. To permit manual reference
   lookup, the owner allows on-demand access for **Profile and notifications**
   (`profile_notifications`, Giphy) and **Vault catalog** (`vault_catalog`, release
   forms) on the intended page. Keep scheduled collection off unless separately
   approved. Set per-run/day credit/call/byte limits in Hub.
3. The owner explicitly refreshes the banned-word dictionary in Hub. Preview then
   reads local Hub storage and does not initiate vendor collection.
4. Sending or using conversation actions is a deliberate user command; existing
   Hub per-key permissions, account/page grants and provider accounting apply.
   A manual reference lookup is one bounded page; it does not auto-page.

SQLite migration 21 is forward-only and preserves outbox history. SDK artifacts
are generated from clean Hub commit `41679950c9926bf4137d9002b54a52015fa42740`,
contract hash `9b84eff9d5107f7cd916cae3fe7579e0fa0b0c85e80d736d2ff765356da3f617`.
They are a separate vendor commit. Credentials and network calls remain in main;
renderer inputs pass Zod and the generated Hub contract before command enqueue.

## Validation

`pnpm check` covers typecheck, lint, shared and desktop tests, and production build.
Regression cases cover exact cents, safe IDs, complete v2 payload persistence,
422 preservation, indeterminate status, explicit unchanged recovery, GIF-only
messages, action coalescing/restart recovery, confirmed-only local updates,
reference envelopes and bounded-history state retention. Renderer store tests
cover all-field validation and recovery metadata isolation.

The built renderer was exercised with local mock data in a browser: message
options and chat menu render, $6.97 appears exactly in the send confirmation,
caption defaults to visible, and the browser console has no errors. No live
provider sends, paid probes, packaging, deployment or collector activation were
performed in this batch.
