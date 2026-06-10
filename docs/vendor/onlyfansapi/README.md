# Vendored OnlyFans API documentation

Snapshot of https://docs.onlyfansapi.com taken 2026-06-10, for offline/AI-agent access.

| File | What it is |
|---|---|
| `llms-full.txt` | Complete LLM-friendly docs dump (~4.9 MB, ~127k lines): every docs page + per-endpoint embedded OpenAPI YAML. Note: at snapshot time `docs.onlyfansapi.com/llms.txt` served byte-identical content (no short index exists), so only this copy is kept. |
| `openapi.json` | Machine-readable API spec (201 paths / 266 operations), from `https://app.onlyfansapi.com/scribe-docs/openapi.json`. **Source of truth for request/response shapes; use it for TS type codegen.** The same spec in YAML lives at `…/scribe-docs/openapi.yaml` (not vendored — identical content). |

## How to navigate (for AI agents)

- **Don't read `llms-full.txt` end-to-end.** Grep it for page headings/endpoint names, then read the surrounding region: `grep -n "Send Message" docs/vendor/onlyfansapi/llms-full.txt`.
- **Per-page fresh docs:** append `.mdx` to any docs page URL and fetch it, e.g. `https://docs.onlyfansapi.com/api-reference/chat-messages/send-message.mdx`. Curated per-subsystem URL list: `docs/research/onlyfansapi.md` §8.
- **Field-level truth:** query `openapi.json` with `jq`, e.g. `jq '.paths | keys' openapi.json` or `jq '.paths["/api/{account}/chats/{chat_id}/messages"]' openapi.json`.
- **Docs MCP server** (live search, no key needed): `https://docs.onlyfansapi.com/api/mcp` — tools `search_docs`, `get_doc_page`, `get_overview`.

A digested research report (capability map, real-time strategy, credits/pricing, gotchas) lives at `docs/research/onlyfansapi.md` — read that first.
