# OFAPI webhook fixtures

Captured live during the Phase-0 webhook spike (2026-06-10, team `goslingmanagment`, accounts
`loravie`/`loravievip`), then **anonymized** with `scripts/spikes/anonymize-webhooks.mjs` —
structure preserved exactly, all names/usernames/texts/ids/avatar URLs replaced with stable
fakes (cross-references between events stay consistent).

These fixtures are the primary brief for the core repo's webhook receiver
(see this repo's `docs/SPEC.md` §9.2).

## Delivery contract (live-verified)

- Envelope: `{event, account_id, payload}` — there is **no event-id field in the body**.
- **Dedupe key:** `x-ofapi-idempotency-key` header, format `evt_<40 hex>`. At-least-once
  delivery, up to 5 retries, 15 s response timeout.
- **Signature:** `signature` header = hex `HMAC-SHA256(rawJsonBody, signing_secret)`.
  Verify against the *raw* request bytes — re-serializing the JSON breaks the MAC.
- User-agent: `OnlyFansAPI.com/Webhook-Client`. Content-Type: `application/json`.
- `users.typing` fires ~every 3 s while the fan types; there is no "stopped" event
  (client-side ~5 s decay). `users.online/offline` are polled vendor-side, not instant.

## Files

| Fixture | Provenance |
|---|---|
| `messages_received.json`, `messages_sent.json`, `messages_deleted.json`, `messages_ppv_unlocked.json`, `transactions_new.json`, `users_typing.json`, `users_online.json`, `users_offline.json`, `subscriptions_new.json` | **Live-captured**, anonymized (691 deliveries over the ~3.5 h window) |
| `unverified_tips_received.json`, `unverified_subscriptions_renewed.json` | Documented example payloads from docs.onlyfansapi.com — these two event types did not fire during the capture window; marked `verified: false`. Re-capture when they occur naturally. |

`_meta` on each fixture is ours (capture/anonymization provenance), not part of the wire format.
