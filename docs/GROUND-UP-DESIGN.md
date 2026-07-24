# FIELD — Ground-Up Design Spec

**Status:** founding reference for prototyping in this repo, not a
production commitment. Originally written 2026-07-23, after a single
session that found and fixed three real, live bugs (streak-board naming
collision, ambient-panel skeleton overlap, chip overflow). **Revised
2026-07-24**, after actually building against these principles (the
AmbientPanel + DeskCard SolidJS rebuild) produced real evidence — some
of it confirming, some of it humbling. Updates are marked inline rather
than silently folded in, per this doc's own rule below about not
silently drifting.

**How to use this doc:** every principle below traces to a specific,
real incident — not generic rewrite advice. If you're prototyping
something here and it conflicts with one of these, that's worth noticing
explicitly, not silently drifting from — either the prototype is
teaching you the principle was wrong, or it's cutting a corner worth
naming out loud. This revision is that rule applied to itself.

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

**CONFIRMED (2026-07-24):** this is no longer a prediction. The actual
rebuild's `<Switch><Match>` makes the skeleton and content branches
mutually exclusive by construction — there is no code path where both
render. Not "harder to write," genuinely not writable. Strongest result
in this whole document, because it's the only one tested against a real
build rather than reasoned from the original incident alone.

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

**HUMBLED (2026-07-24):** knowing this principle did not prevent it from
happening again. The first pass of the AmbientPanel rebuild — written
*with this exact document open as the spec* — still shipped
`.reasonBadge` without overflow handling while `DeskCard`'s `.matchup`/
`.venue` had it. Same gap, third occurrence, despite the gap being
explicitly named in the doc being built against. It only got caught by
an actual verification pass reading the real committed CSS, not by
having the principle written down. The real lesson isn't "write the
principle" — it's "write the principle AND still verify it held,"
because stating a rule and following it under real build pressure are
different things, every time, no exceptions earned yet.

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

**HUMBLED (2026-07-24):** the rebuild's own production build
(`npm run build`) wasn't actually run until several turns after the
components were declared done — verified by careful manual review of
each file in the meantime, not by a real compiler. It built clean when
finally run, so no harm done this time, but "shipped with the feature"
did not happen here either. Same shape of gap as principle 6: correct
in the document, not automatic in practice.

## 8. Two governance tiers, declared upfront

Full CC-CMD/confidence-gate/Codex discipline for anything shipping to
users. None of it for exploration. This repo (`field-playground`) exists
because the heavy tier got retrofitted onto a need it was never designed
for. Decide both tiers, and the boundary between them, before writing
code — not after the friction teaches you they should have been
separate.

## 9. Uncoordinated concurrent writers will collide — plan for the collision, not for preventing it (NEW, 2026-07-24)

Not anticipated by the original eight — discovered by living in this
repo's own lighter-governance tier. This exact document collided on its
own filename: written independently in two places (this file, and a
separate design doc Claude Code wrote in its own session) without either
side knowing about the other, resolved only when a merge conflict forced
it into the open (Claude Code's version renamed to
`docs/SOLIDJS-BUILD.md`; a set of commits also got misattributed to the
wrong author in the process, since nobody had a way to check who
actually made them). Nothing broke — git's own conflict detection did
real work here, and `commit_file`'s stale-`parent_sha` rejection prevents
blind overwrites on the writing side. But coordination gaps are real in
a repo built for speed over process, and adding real process would
defeat the point of this tier existing. The honest design stance: expect
occasional collisions as the accepted cost of tier 8's tradeoff, rely on
git's conflict detection to surface them rather than hide them, and
don't mistake "no collision yet" for "coordinated" — it usually just
means nobody's touched the same file yet.

---

## What's already right — keep this, don't rebuild it

Externalizing session memory into `HANDOFF.md`, `CODE_MAP.json`, and a
permanent, zero-deletion Codex is a good, hard-won answer to a real
problem: an agent with no persistent memory needing real continuity
across sessions. Nothing found this session argues against it. If
anything, this repo's own `docs/OPERATING-MODE.md` and this doc are that
same pattern, deliberately kept even in the lighter-governance tier.

---

## What the actual rebuild changed about this document's confidence

Two principles (2, 7) predicted correctly and got no real test until
now — one held completely (2), one held on the technical claim but not
on the practice of *shipping* it as promised (7). One principle (6) was
violated by the very build meant to demonstrate it, despite being
explicit, written, and open in front of whoever wrote the first pass.
The pattern across all three: writing a principle down changes what gets
*caught*, not what gets *written correctly the first time*. Verification
remains load-bearing even when the design is right — maybe especially
then, since a documented-and-still-broken gap is easier to miss than an
undocumented one, precisely because it looks like it should have been
covered.
