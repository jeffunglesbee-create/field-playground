# CC Session Outbox — demo/infra component sweep

**Date:** 2026-08-05

---

## What was asked

"Write outbox first. Sweep the demo/infra components too" -- extending real verification coverage to
the 33 components the earlier "why should I care" audit classified as not applicable to a verdict
sentence (Solid.js reactivity/pattern demos, and pure UI chrome/infrastructure). Those 33 were never
edge-case-tested by either the verdict sweep or the edge-case closure pass, since neither touched them
on purpose.

The "why should I care" verdict pattern genuinely doesn't apply here -- a component demonstrating
`createComputed` vs `createEffect` flush order, or `indexArray` vs `mapArray` mount behavior, has no
ranked list or stat to translate into plain language. What DOES apply, and hasn't been done yet: the
same real-branch, real-bug-finding rigor just applied to the 28 verdict components -- exercising each
demo/infra component's own real interactive behaviors and edge cases, checking for crashes or incorrect
output, fixing anything real found.

---

## Scope: the 33 components

`CommandPalette, ComputedDemo, ContextDemo, ControlGroup, CreateRootDemo, DateBrowserTransition,
DayComparison, DeskModes, DrillDown, ErrorBoundaryDemo, FieldIdentity, Ground, IndexArrayDemo,
LazyBoundaryDemo, LocalNoteLayer, Multiview, PollDeltaFeed, Presence, PropsDemo, ReactivePerfPanel,
ReorderCost, ReplayDemo, ScoreFeed, ScoreTicker, SelectorDemo, SuspenseDemo, Tabs, TeamAffinitySync,
Toast, TransitionDemo, UndoStackDemo, WorkerBridgeDemo, WpSourceBadge`

Derived by diffing the full `src/components/*` list against every component already covered this session
(the 28-component verdict sweep, the 8 already-fine components, the 5 inherently-experiential
components, and the 4 original pattern-setters: LeverageIndex/ValueNight/ContradictionRadar/ForkPoint).

---

## What's next

Real-browser sweep of each component's own interactive/reactive behavior for correctness -- results and
any fixes to follow in this same doc.
