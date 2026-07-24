# Experiment: live reconciliation (poll → partial update)

**The question, made sharp enough to actually answer:** the first
experiment (AmbientPanel/DeskCard) only tested *initial load* — skeleton
to content, once. It never tested what happens on *re-fetch*, which is
where FIELD's actual worst bugs have lived: cards stuck on live state
after a game goes final, a pick-resolution flag that never flips,
cross-game text racing on re-render. Those are reconciliation bugs, not
render bugs — a different failure class, untested by the first
experiment entirely. Would a real reactive framework make *that* class
structurally harder to write, the same way it did for skeleton-overlap?
Genuinely unknown — this experiment tests it.

**Scope, on purpose:** extend the existing `DeskCard` component (not a
new one) to poll `/context/date/{date}` on an interval and reconcile
incoming state against what's already rendered — a live game's score
updating, a game transitioning pre→live→final→final_ot, without a full
remount. Read-only, off the same commodity relay endpoint already in
use. Zero new RUWT tension — nothing computes or ships, same as before.

**Explicitly not doing:** journalism, drama state, picks, anything that
writes. Still just watching public game data change over time.

**Why this specific bug class, not a broader stress test:** a
same-lane-but-more-instances test (e.g. more chip types) would mostly
re-confirm what's already known about principle #6. This targets
something genuinely untested — temporal state, not just initial state —
which is where the real, already-documented FIELD incidents actually
happened, per Codex and prior HANDOFF entries (MLB cards stuck live
after final, a permanently-stuck pick-resolution flag, a Night Owl
cross-game text race). Real incidents, not hypothetical ones — same
standard the first experiment held itself to.

**Done when:** a live poll cycle correctly transitions a game's rendered
state without a full remount or a stuck intermediate state, AND there's
an honest answer to whether that came free from `createResource`'s
signal-driven refetch or required the same kind of manual bookkeeping
field.js needed. Either answer is a real result.

---

## Log

*(empty — this is the scoping doc, not yet started)*
