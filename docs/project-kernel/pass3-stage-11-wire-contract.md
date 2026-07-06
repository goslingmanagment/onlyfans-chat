> **SUPERSEDED (Stage 35, 2026-07-07):** this is the Pass 1 (pre-migration)
> codebase map, kept as the migration's historical record. The regenerated
> post-migration maps live in `docs/generated/` in this repo.

# Stage 11 wire contract — desktop capture uploader (3c input, fixed by core)

Written 2026-07-05 by the core Stage 11 build session. This is the §2 desktop
contract block from `core/docs/project-kernel/pass3/stages/stage-11-client-capture-lane.md`,
handed over verbatim per spec task 3. The core side is BUILT (green-local on
the kernel chain); the endpoint ships with the next core deploy. The desktop
half (generalizing the Stage 4 durable spool into the capture uploader) is the
3c/Stage 12 executor's work and must implement exactly this:

## Endpoint

`POST /api/v1/ingest/observations` — chatter **bearer key** auth (the existing
credential; device tokens arrive in Stage 22 with zero contract change).
The **`x-client-version` header is required** — requests without it get 400.

## Body

```json
{
  "events": [
    {
      "clientEventId": "<uuid, generated once per event at capture time>",
      "kind": "ai_acceptance | guard_audit | send_audit | ai_spend | credit_spend | data_purge_notice | <anything>",
      "observedAt": "<ISO timestamp — when the fact happened on the device>",
      "payload": { "...": "free-form object, the fact verbatim" },
      "pageLabel": "<optional core page label when the fact is page-scoped>"
    }
  ]
}
```

- `events`: 1..100 per batch; request body cap 1 MB; rate limit 120/min.
- Unknown `kind`s are **accepted and journaled** (`desktop.unknown:<kind>`),
  never dropped — do not gate uploads on an allowlist client-side.

## Response

`200 {"accepted": n, "duplicates": m}` — the client may prune its spool on
EITHER (duplicates mean the kernel already holds the fact; resend was free).

## Client obligations (Stage 4 spool semantics)

- Batch is **whole-batch atomic** server-side: on any non-2xx, resend the
  WHOLE batch until 2xx. Dedup on `clientEventId` makes overlap free — never
  regenerate the uuid on retry.
- `429`/`503`: honor `Retry-After` / rate-limit headers; the spool absorbs.
- `400` (schema-invalid / missing version header / unparseable `observedAt`):
  the ONLY case that must not be retried verbatim — route the batch to the
  exportable quarantine (Stage 4 semantics), never delete.
- `cmd:data.purge` full semantics: upload `data_purge_notice` first, wait for
  2xx, then wipe the device copy — purge the device, never the kernel's copy.
- Stage 12's one-time harvest reuses this exact lane with
  `producer` distinguished server-side by... nothing the client sets: the
  harvest uploader should send its own `x-client-version` as
  `harvest-<app version>` so the journal separates the lanes.

## Kind payload expectations (initial, canonicalizer-backed)

The core family is registration+validation only for now (no domain events
until Stage 29), so payload shapes are journaled verbatim — keep them stable
and self-describing. Recommended minimum fields:

- `ai_acceptance`: `{suggestionId, feature, outcome: shown|inserted|edited|sent, conversationId?, model?}`
- `guard_audit`: full text + verdict, exactly what the device holds today
- `send_audit`: `{messageRef?, conversationId, textHash?, sentAt}`
- `ai_spend` / `credit_spend`: the device-side ledger row verbatim
- `data_purge_notice`: `{scope, reason, initiatedBy, deviceId?}`
