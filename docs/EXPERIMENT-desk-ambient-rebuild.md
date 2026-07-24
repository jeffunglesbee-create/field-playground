# Experiment: rebuild Desk card + Ambient panel from scratch

**The question, made sharp enough to actually answer:** field.js is
45,000+ lines of hand-rolled DOM manipulation. Real bugs keep coming from
the same shape of gap — this session alone: a loading skeleton that
never got told to disappear because nothing enforces "old node out before
new node in," a chip class with no overflow handling because CSS
containment isn't anyone's job to remember. Would a real component
framework make those categories of bug *harder to write*, not just
easier to catch after the fact? That's genuinely unknown, and it's
answerable.

**Scope, on purpose:** one surface, not the app. The Desk card + Ambient
panel — chosen because both bugs above lived there. Real data, read-only,
off the relay's existing public endpoints (commodity data, zero RUWT
tension since nothing computes or ships). Visual fidelity target is the
real deployed app, side by side, not "good enough."

**Explicitly not doing:** journalism rendering, drama-state display, pick
logic, anything RUWT-adjacent, anything that touches a real user. This
is a rendering-architecture question, not a feature.

**Done when:** the surface renders real Desk + Ambient data correctly,
side-by-side comparable to production, AND there's an honest answer to
the actual question — either "yes, this shape of bug becomes structurally
awkward to write here" with a concrete example, or "no, same footguns
just in a different syntax" with a concrete example. Either answer is a
real result. A component library that merely looks nice isn't done.

**Build log starts below as it happens — no session ceremony, just what's
true right now.**

---

## Log

**2026-07-23** — Scoped. Starting with the Ambient panel specifically
(smaller surface, and the skeleton-overlap bug's root cause — "nothing
clears the old state when the new state mounts" — is exactly the kind of
thing a real reconciler either solves for free or doesn't).

**2026-07-23** — Vite + SolidJS scaffold built, `AmbientPanel` and
`DeskCard` both wired to `createResource` against the real relay
endpoints (`/analytics/newspaper/{date}`, `/context/date/{date}`, live
data confirmed, not stubbed). Both components handle loading/error/
content structurally via `<Show>`/`<Switch>` — no imperative flag
anywhere that could be forgotten. **Test 1 (skeleton-overlap) result:
yes, structurally awkward to write here** — the skeleton's own visibility
is a reactive expression tied to `resource.loading`, not a call site
someone has to remember to make.

**2026-07-23** — Verification pass (not code review — checked the real
committed CSS) found Test 2 had already gone the other way: `.skeleton`/
`.bar`/`pulse` were duplicated verbatim across both components' CSS
modules, and `AmbientPanel`'s `.reasonBadge` chip was missing the exact
overflow handling `DeskCard`'s `.matchup`/`.venue` already had — same
gap, same shape, reintroduced inside the experiment meant to test
whether this architecture prevents it. **Test 2 (containment) result:
no, same footgun, different syntax** — SolidJS's component-scoped CSS
doesn't structurally prevent a chip from launching without containment
the way `<Show>` structurally prevents a skeleton from lingering. This
was predicted almost exactly in `docs/SOLIDJS-BUILD.md` before it
happened.

**2026-07-23** — Fixed, not just noted: added `src/components/shared.module.css`
as a real shared primitive (`.chip` owns containment, `.skeleton`/`.bar`/
`.wide`/`.medium`/`.narrow`/`pulse` deduplicated). Both components now
import and compose it instead of each carrying their own copy.
`reasonBadge`/`tier` compose `shared.chip` for containment while keeping
their own background/color as visual identity only.

**Honest caveat on the fix:** applied via direct file edits, carefully
cross-checked against each file's exact prior content and CSS Modules'
import/compose pattern already in use elsewhere in these same files —
but not verified against an actual `npm run build` or a live render,
since no Node toolchain was available to do that check from where the
fix was made. Worth an explicit `npm run build` + visual check as the
next real step, not assumed clean.

---

## Current honest answer to the experiment question

**Split result, and that's a real result, not an inconclusive one:**
some categories of bug (state-transition/lingering-old-content) become
structurally hard to write with a real reactive framework. Others
(CSS containment discipline) don't — they're still a convention someone
has to remember, just easier to *see* the omission once you know to look,
since each component's styles live next to its own markup instead of
buried in a 45k-line file. A shared primitive closes the containment gap
the same way it always does — not free from the framework, but cheap to
build once you have real modules to put it in.
