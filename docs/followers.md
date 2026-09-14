# New followers (OnlyFans desktop)

Introduced in 0.1.53 (D32 / Hub 339). The D34 / Hub 342 enumeration correction
described below is included in the 0.1.54 release candidate.
Release order: deploy that Hub support first, validate the served contract hash
against the vendored SDK, then run the packaged Windows/macOS release gates.
The public update feeds determine whether publication has completed.

## Operator flow

Open **Новые фаны / New fans** in the account rail or command palette. Select a
window and explicitly acknowledge the OFAPI credits/read-state effect. Opening
the page, filters, cached history and the trace costs no provider requests.
Start fixes `[start − hours, start]`; resume uses those same bounds. The date is
`subscribedOnData.subscribeAt`, never the user's platform join date. It describes
the provider's subscription record, not an inferred renewal date.

Progress counts processed rows. Ready means a complete history without known
personal contact or uncertain outgoing origin; incoming history is a separate
reply queue, personal outgoing history is already-contacted. Missing dates,
malformed rows, non-progressing pagination and the 1000-message cap cannot make
a fan ready. Enumeration uses `/fans/latest?type=new`, with the provider's
`data.users` response. The calendar query covers UTC dates from one day before
`from` through two days after `to`; exact inclusive `[from,to]` filtering remains
local because the provider does not specify its date-zone/inclusivity semantics.
Enumeration follows validated `_pagination.next_page` offsets and explicit
`hasMore`. Neither old dates nor short pages prove exhaustion. Foreign,
non-advancing, selection-changing, contradictory or incomplete responses fail
closed. Repeated pages without new identities or accepted entries stop the scan.
Empty advancing pages are allowed, bounded by 250 pages / 5000 examined rows;
limits are visible as an incomplete list. Provider offset pagination is not a
transactionally frozen roster. `type=new` excludes renewals, but classification
of a returning subscriber and the precise meaning of `subscribeAt` still need
live-account verification. See D34 and Hub decision 342.

OnlyFans does not provide sufficiently strong message-origin evidence in the
vendored contract to tell a single-recipient scheduled message from a mass
message using `isFromQueue`, or to prove welcome origin from matching text.
These outgoing messages remain **unknown**, with their reason and cached chat
visible. The feature deliberately does not invite a greeting on this evidence.
`queueId` also appears on personal-message examples and is not an exclusion.

Pause to work with an already-checked fan. Generate creates one editable greeting
through the existing AI coordinator and server-owned OF context. View/review the
current result before sending. The service reads fresh sendability and history
again, rejects changed proof, and checks local pending sends immediately before
the ordinary outbox enqueue. Core allows at most one held first-greeting command
for a page/fan across users. Its ambiguous/confirmed attempts keep that claim.
A native or ordinary message racing the final check is outside this feature's
cross-user claim. Do not describe this as an atomic platform conversation lock.

A failed greeting must return through this screen's recheck; the ordinary inbox
Retry refuses it. Unknown delivery remains in the standard outbox verification
flow. There is no automatic send, retry of an indeterminate write, or bulk send.

## Requests and diagnostics

All calls travel through the Hub read gateway; no vendor credential enters the
renderer. The follower FIFO is separate per account, and is shared by scans,
history expansion and preflight. Minimum delay after response is 1 second for
list/settings and 1.5 seconds for history/profile, rising to 8 seconds after 429.
429 waits use at least 30/60/120/240/300 seconds and honor longer Retry-After;
five attempts exhaust the current read. Account/auth/credit failure stops the
scan. There are no hidden client GET retries on this path. The normal global
limiter still admits each request; its queue wait is outside the HTTP deadline.

Enable the application's existing Debug mode before starting a run. The journal
contains wall-clock ISO milliseconds, elapsed milliseconds, request queue/start/
response events with safe page parameters, cooldowns and per-fan outcomes.
Page events include source, offset, row count, `hasMore`, next offset and observed
date extrema. Stop events identify exhaustion, scan limit or invalid/repeated
pagination; terminal failures include the stage/code and locally authored
validation reason, never raw provider text. It
retains eight runs, up to 100000 events and 20M characters each; dropped events
are disclosed. Pause, terminal/action and clean shutdown checkpoints persist it
in encrypted SQLite. A crash before a checkpoint can lose unfinished events.
Text export contains no headers, keys, message bodies or AI prompts.

## Validation

Fixture checks cover 700 fans, exact time bounds, missing dates, ambiguous
origins, history caps/pagination, failed strict parsing, delayed rate admission,
long 429 Retry-After, pause races, authorization loss, changed pre-send history,
protected standard outbox intake and forbidden inbox retry. UI uses the existing
mock bridge for account switches, drafts, paging, journal and navigation tests.
Independent adversarial review covers desktop and the separate Hub implementation.
Live provider reads, real fan messages and deployment are not part of these
checks. A live send smoke must use only `P3_SEND_TEST_FAN_ID` under the binding
`docs/SESSIONS.md` protocol; without it, leave that verification to the owner.

Validation recorded on 2026-09-15: `pnpm check` passed (563 shared + 1765
Desktop tests, five existing skips; typecheck, lint and build passed). The
three additional TanStack Virtual warnings follow the existing UI pattern.
A fresh Electron native rebuild and keyless macOS arm64 `--smoke` boot passed.
CUA verification at 1280×720 covered 700 rows/7 pages, return navigation,
chronological history and its fully visible last message; the UI agent also
checked RU, draft/generation fixture flows and debug export. Backend checks:
3828 unit tests and 146 PostgreSQL integrations; a second agent independently
ran the affected backend contract/custody tests. Neither these fixtures nor the
keyless boot establish live-account provider correctness or a packaged release.


D34 correction validation (2026-09-15): full `pnpm check` passed with 563 shared
and 1814 desktop tests (five existing skips). An independent agent re-ran the
latest parser/service cases and reviewed both repositories. Core passed its full
check with 3845 unit tests plus the focused 102-test gate (49 PostgreSQL cases).
No live-account validation was possible: the local app is not signed in. The
[incident report](followers-incident-2026-09-15.md) separates observed log facts,
code defects and the remaining live test. This correction ships with 0.1.54; publication still requires the normal release gates.
