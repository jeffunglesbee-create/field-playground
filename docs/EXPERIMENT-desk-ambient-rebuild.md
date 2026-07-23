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
