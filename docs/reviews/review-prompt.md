# Переиспользуемый промпт для независимого ревью планов

Запускать в новой сессии в этой папке (CLAUDE.md подхватится автоматически). Отчёт сохраняется в `docs/reviews/` на русском; дальше его можно отдать рабочей сессии на перепроверку и применение.

---

You are a demanding, skeptical technical reviewer. This repository is in its planning phase (no code yet): PRD/SPEC/PLAN and research docs for AI-driven development of a desktop app for OnlyFans agency chatters, built on onlyfansapi.com ("OFAPI"), integrating with the existing production backend at `~/code/core`. Your task is a full independent review of the plans before development starts: direction, architecture, details, edge cases, internal consistency, factual accuracy. Previous reviews have already been applied (see `git log` and `docs/reviews/`) — do not restate their findings; hunt for what hasn't been found yet. If an already-applied fix is itself wrong, do call that out.

Read in full, in this order: `CLAUDE.md` → `docs/PRD.md` → `docs/SPEC.md` → `docs/PLAN.md` → `docs/research/legacy-chatgoose.md` → `docs/research/onlyfansapi.md` → `docs/research/agency-hub-core.md` → `docs/vendor/onlyfansapi/README.md`.

**Fact-checking rules (mandatory):**
- Verify every claim about OFAPI against `docs/vendor/onlyfansapi/openapi.json` (via `jq`) and `docs/vendor/onlyfansapi/llms-full.txt` (via `grep`); where needed, make live calls: the key is in `.env` (`ONLYFANSAPI_API_KEY`, base `https://app.onlyfansapi.com/api`). HARD CONSTRAINT: read-only GET requests only; no sends, no mutations, no webhook create/delete — a real production account is connected. Budget ~30 requests (account-scoped calls cost 1 credit each).
- Verify claims about core against the code in `~/code/core` (read-only, change nothing; routes: `apps/runtime/src/api/server.ts`, contracts: `packages/contracts/src/routes.ts`).
- Verify claims about the legacy product against `~/code/chatgoose` (read-only).
- Do NOT look into `~/code/chatgoose_desktop` (owner-forbidden).
- Any finding without verified evidence must be labeled "hypothesis, not verified". Never present assumptions as facts.

**Review dimensions — address each explicitly:**
1. **Direction & strategy.** Is the product shape right (desktop client on top of OFAPI; P2 companion mode with copy-to-OnlyMonster; sending in P3)? Is there a simpler/cheaper path to the same value that wasn't considered? What single assumption, if false, kills the whole product (strategic single point of failure)?
2. **Consistency.** Contradictions across PRD/SPEC/PLAN/CLAUDE.md/README: phase labels, gates, terminology, phase scopes, repo responsibilities (this repo vs core).
3. **Factual accuracy.** Endpoints, fields, limits, credits, webhook events, core behavior — against primary sources.
4. **Edge cases.** Covered, or at least acknowledged? Seed list (do not limit yourself to it): two chatters on one account simultaneously; `accounts.session_expired` mid-shift; OFAPI 5xx mid multi-part `[NEXT]` sequence; webhook duplicates and replay after SSE reconnect; race between an optimistic message and the same message arriving via webhook/polling; unicode/emoji/HTML in message text and names; fan deleted their account / blocked; `canSendMessage=false`; PPV price outside $3–200; credits exhausted mid-shift; cascading 429s; SSE reconnect storms; fan changed username (page-label mapping by username); 3000+ message conversations; timezones in the `[HH:MM]` transcript format; prompt injection via fan name/bio/custom name/notes; personality deleted while an AI operation is running; key revocation (OFAPI or core) mid-shift; skewed client clock (24 h unsend window, core's `completedAt` ≤5 min validation).
5. **Feasibility & economics.** Recompute the credit and LLM cost math in PRD §10 (show your work); sanity-check the per-phase week estimates against the scope; name the riskiest assumptions that Phase 0 should be validating but somehow isn't.
6. **AI-dev readiness.** Are the docs unambiguous enough for a fresh session to build Phase 0–P1 without asking questions? Where would an agent most likely "guess wrong" (ambiguity, underspecification, conflicting docs)?
7. **Unlisted risks.** What's real but absent from PRD §11 / PLAN standing risks?

**Output format.** Save the report to `docs/reviews/<YYYY-MM-DD>-plan-review.md` (today's date) and also reproduce it in full in your final message. Structure:
- **Verdict** — 3–5 sentences: is the direction right, the top risk, overall readiness.
- **Findings** — `[P1]` blocker / `[P2]` should-fix / `[P3]` nice-to-have; each finding: the claim → evidence (file:line or API/jq output) → why it matters → a concrete proposed fix.
- **Checked and OK** — what you specifically verified and found sound (so it isn't re-litigated later).
- **Hypotheses & questions for the owner** — kept separate from findings.

**Write the entire report in Russian** (keep file paths, technical terms, and quotes as-is in English). Do not modify anything in the repository except the report file.
