# FIELD — Ground-Up Design Spec

**Status:** founding reference for prototyping in this repo, not a
production commitment. Written 2026-07-23, after a single session that
found and fixed three real, live bugs (streak-board naming collision,
ambient-panel skeleton overlap, chip overflow) and used each one as
evidence for what a from-scratch design should get right the first time.

**How to use this doc:** every principle below traces to a specific,
real incident — not generic rewrite advice. If you're prototyping
something here and it conflicts with one of these, that's worth noticing
explicitly, not silently drifting from — either the prototype is
teaching you the principle was wrong, or it's cutting a corner worth
naming out loud.

---

## 1. Real ES modules from day one — no monolith syncing to a deploy artifact

FIELD's actual source of truth, `src/legacy/field.js`, is 2.3MB. This
session's own tools (`read_file`/`read_lines`) failed silently against
it all session — not a bug in the tools, a direct symptom of GitHub's
Contents API 1MB ceiling on inline file content. The esbuild migration
(Phases 1-7, first real TypeScript module extractions) is FIELD actively
escaping this. A rebuild starts where that migration is heading — real
modules, real imports — not where FIELD started.

## 2. One rendering model, chosen once, with explicit cleanup contracts

The ambient-panel skeleton bug (Codex: `ambient-panel-skeleton-overlap`)
happened because Solid.js's surgical reconciliation replaced a
wholesale-innerHTML-replace pattern for one component, and nothing
carried forward the implicit cleanup the old pattern gave for free —
the skeleton was a DOM sibling nothing ever told to leave. Pick
fine-grained reactive rendering everywhere, upfront. When a component's
rendering model changes, write down explicitly what the old model
provided implicitly that the new one now needs to provide on purpose.

## 3. RUWT's two tests as one document, written before any relay code

Rule F (commodity vs. proprietary — may the relay compute this at all)
and Rule A (pull vs. push — may it ever autonomously send this) are
sound, but Rule A was discovered as a *separate* addition after Rule F
was already load-bearing — meaning something could pass F and still
violate A without an obvious reason to suspect it. Write both as one
decision tree before the first relay endpoint exists, not as sequential
patches to a policy already in production.

## 4. The relay as sole credential holder, from the first commit

Real history: raw PATs embedded in git URLs → Rule 80 (credential
boundary) → OAuth 2.1 + PKCE + DCR → per-client trust tiers — each step
reacting to the previous one's exposure. Some of those raw PATs are
still sitting in pre-Rule-80 chat history, findable by search, unrotated
confirmation unclear (Codex: `exposed-pat-pre-rule80-history`). Skip the
reactive phase — relay-holds-the-only-credential is the starting design,
not the fourth iteration.

## 5. A naming gate for anything relay-computed that reaches a public label

`streak_board` (Codex: `streak-board-metric-mismatch`) was a real
editorial-quality signal wearing real sports-streak vocabulary
("hot"/"cold"/"streak"), and it shipped to a public card because nobody
asked what a user would assume the name meant before it reached a
label. This is Rule F's own logic extended one step further: not just
"may the relay compute this," but "does the field's name lie about what
it computed." One question, asked at naming time — not discovered from
a screenshot months later.

## 6. Containment built into the shared primitive, not into every consumer

Two independent chip classes (`.watch-now-btn`, `.stream-chip`) each
separately forgot overflow handling — the same gap, twice, because
there was no shared base either inherited from. One pill/chip primitive
with `overflow:hidden; text-overflow:ellipsis; max-width` on it once.
No variant gets the chance to forget what it was never responsible for
remembering.

## 7. Verification artifacts ship with the feature, not bolted on after a bug report

The most expensive relearned lesson this session (now Rule 90,
VERIFY-ARTIFACT-A): a verification task written as a bare action verb
("verify," "confirm") is satisfiable without proving anything. Real
fix: a CI-as-proxy Playwright check, real committed screenshots + a
structured manifest with falsifiable fields (`scrollWidth <=
clientWidth`, not "looks fine"). A component touching rendering ships
*with* its own artifact-producing check in the same change that builds
it — not as a follow-up CC-CMD after someone spots it broken in a
screenshot.

## 8. Two governance tiers, declared upfront

Full CC-CMD/confidence-gate/Codex discipline for anything shipping to
users. None of it for exploration. This repo (`field-playground`) exists
because the heavy tier got retrofitted onto a need it was never designed
for. Decide both tiers, and the boundary between them, before writing
code — not after the friction teaches you they should have been
separate.

---

## What's already right — keep this, don't rebuild it

Externalizing session memory into `HANDOFF.md`, `CODE_MAP.json`, and a
permanent, zero-deletion Codex is a good, hard-won answer to a real
problem: an agent with no persistent memory needing real continuity
across sessions. Nothing found this session argues against it. If
anything, this repo's own `docs/OPERATING-MODE.md` and this doc are that
same pattern, deliberately kept even in the lighter-governance tier.
