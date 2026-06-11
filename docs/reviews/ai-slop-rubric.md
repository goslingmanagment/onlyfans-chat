# AI-Slop Review Rubric — Golden Reference Outputs

**2026-06-11.** Applied by the owner to every `tests/fixtures/golden/<case>/reference-<feature>.md`
(P4 gate: "outputs reviewed against the AI-slop taxonomy"). Distilled from the legacy taxonomy:
the sanitizer's production leak patterns, the byte-frozen prompts' own ban lists, and the
anti-AI lessons in `docs/research/legacy-chatgoose.md` §9.3/§11. Every item is an observable
defect — check the universal list plus the class list for the file under review. **One observed
defect rejects the reference** (regenerate with `UPDATE_GOLDEN=1`; if it persists, that is a
prompt-iteration finding — prompts are byte-frozen, changes need this harness + owner approval).

Fixture caveat: transcripts read "Anonymized message N", so judge structure/voice/length/state
handling, not topical relevance. The model commenting on the anonymization is tolerable in
analysis/summary outputs, never inside a reply draft.

## 0. Universal (every output)

- [ ] Meta commentary about being an AI, the prompt, or instructions ("as an AI", "the prompt says", "system prompt", "stay in character", "generated reply")
- [ ] Visible reasoning: `<think>` blocks or fenced thinking/chain-of-thought
- [ ] Wrapping quotes around the output; "Here's a reply:" / "Message 1:" / "Reply:" prefixes
- [ ] Bracket garbage (`[`, `]`, `["` …) or leftover `[NEXT]`/`[VARIANT]` markers inside a single part
- [ ] Transcript-marker leakage: PPV tags, `[Tip: $X]`, media labels quoted back verbatim
- [ ] Invented facts not present in the transcript/context blocks (names, events, purchases, dates)
- [ ] Price/PPV state contradictions vs context: re-pitching an item marked `purchased`, asserting state for an `unknown` tag, quoting the listed price back to the fan

## A. Reply drafts (fast-reply, improve-draft, ping, hi-greeting variants, help-me `<engaging>`/`<flirty>`)

Anything in this class is text a fan could receive.

- [ ] Not reaction-first / too long (fast-reply target: 1–2 sentences, under 20 words); recaps or paraphrases what the fan said
- [ ] Validate→elaborate→question formula; question as its own paragraph instead of woven into the reaction
- [ ] Banned phrases: "not gonna lie", "hits different", "that's actually…", "I don't take that lightly", "and honestly?" / "but honestly", "solid \<noun\>", "actually" as surprise filler
- [ ] Negative parallelism: "that's not X, that's Y" / "…energy"
- [ ] Therapy-speak / life-coach / motivational-Instagram energy; analytical emotion labeling ("the worst kind of", "that kind of X where Y"); "hope \<thing\> gets better" politeness filler
- [ ] Unsolicited markdown structure in a chat reply: headings, bullets, bold/italic, tables
- [ ] Em-dash/long-dash habit, synonym cycling, overly polished grammar — Lora types plain text, simple words, lowercase, slightly imperfect
- [ ] Emoji abuse: emoji on every sentence or outside the personality's habit set
- [ ] Wrong language (must be the fan's language; improve-draft adapts the RU draft) or out-of-character energy jump (neutral → extreme with no runway)
- [ ] **ping**: mass-blast opener ("hey how are you?"), salesy pivot, fake familiarity (segment B), absolute history claims ("we've never talked"), "just been thinking about you" / "you crossed my mind", segment strategy ignored
- [ ] **hi-greeting**: not exactly 3 genuinely different variants; no username-derived address when usable; "thanks for following!" / "welcome!"; clingy lines ("you've been quiet"); leads with content/subs/tips

## B. Analysis outputs (help-me `<coaching>`, chat-review)

- [ ] Output outside the required XML tags, missing tags, or chat-review rating that is not a bare integer 1–10
- [ ] Not second person to the chatter; no references to actual transcript moments; invented quotes
- [ ] Rating inconsistent with the evaluation text (e.g. an 8 above a list of major character breaks)
- [ ] Generic coaching filler instead of concrete, conversation-specific actions
- [ ] Hedging/preamble boilerplate ("it's important to note", "overall, great job!")

## C. Fan-summary (Russian document)

- [ ] English leakage: full English sentences/paragraphs (loan terms like churn risk / girlfriend experience are fine)
- [ ] DOSSIER contains inferred or assumed "facts"; key quotes not verbatim from the transcript
- [ ] Empty sections padded instead of skipped ("unknown", "not mentioned", "нет данных")
- [ ] Financial classification/trend contradicting the spending & subscription blocks (or unstated conflict resolution)
- [ ] Old behavior weighted over recent; stage/trajectory claims without transcript support
- [ ] Not plain text with simple headers: markdown tables, emoji decoration, nested bullet explosions

## Outcome

- All clean → tick the checklist at the bottom of the reference file; the reference is the locked
  regression baseline for that feature/case.
- Any defect → reject and regenerate; recurring defects across regenerations are logged as prompt
  findings in `docs/PLAN.md` (P4) — never hot-fixed in the prompt files.
