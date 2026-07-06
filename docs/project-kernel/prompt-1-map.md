# Project Kernel — Pass 1: Codebase Map (ChatGoose Desktop)

Run this on Opus 4.8, in a fresh session opened in this repo.

---

You are mapping a codebase so that a stronger model can later perform a
deep architecture review and design a rework plan across a three-project
ecosystem. This pass covers ONE project; the other two get their own
passes. Your output is the reviewer's map of this territory — make it
complete, precise, and factual.

The project: /Users/dmitriy/code/chatgoose_desktop_fable — ChatGoose
Desktop, an OnlyFans chat workspace application. It works against a
backend hub called core (documented in its own pass) and against
OnlyFans itself.

Scan all the code — every package, module, service, script — and
document everything important, so that the reviewer can understand this
project completely without re-discovering it from scratch. Let the
codebase itself dictate what the documentation covers and how it is
structured; do not work from any predefined checklist of topics — if
something exists in the code and matters, it belongs in the map. The one
thing to treat with special care is the project's boundaries: every
contract it has with the outside world, described from this side —
what it exposes and for whom, what it calls, and exactly what data
crosses each boundary — because the reviewer will be stitching three
projects together. Anchor claims in file paths so the reader can jump
straight to code.

Strictly descriptive. No ratings, no "should", no recommendations, no
architectural opinions — the reviewing model must form its own judgment,
and your job is only to make the territory legible. Where the code's
actual behavior differs from what names or comments suggest, describe
the actual behavior.

Ignore old audit/review/plan documents in the repo — document the code
as it is now, not as documents say it was or should be.

Write the documentation in English into docs/project-kernel/ in this repo
(the folder already exists and holds this prompt file — leave it and any
other existing files untouched).

---

## Stage 35 regeneration addendum (2026-07-07)

This prompt is re-runnable. When regenerating (Stage 35 and after):

- Write the maps into `docs/generated/` in this repo (create the folder if
  absent), NOT into `docs/project-kernel/` — that folder now holds the
  historical Pass 1 originals, which stay untouched and carry superseded
  banners.
- Start every generated file with this banner (fill in the current date and
  `git rev-parse --short HEAD`):

  > Generated <YYYY-MM-DD> from <path to this prompt> at commit <sha>.
  > Machine-generated reference — regenerate by re-running that prompt in a
  > fresh session; do not hand-edit.

- Map the tree as it is TODAY (post-kernel-migration). The Pass 1 originals
  may be consulted as a checklist of territories, but every claim must be
  re-verified against current code — subsystems that no longer exist are
  dropped, new ones (whatever the code contains now) are mapped.
- Keep file naming NN-topic.md with a 00-overview.md index, but let today's
  codebase dictate the actual breakdown.
