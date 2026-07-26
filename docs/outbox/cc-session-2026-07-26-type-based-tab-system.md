# CC Session Outbox — Type-Based Tab System (Games/Picks/Stats/Journalism/Social/System/Lab)

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#13 (merged)
**Commit:** 77de8dd (squash merge to main)

---

## What was asked

"Look at the playground file organize surfaces/modules by type, games,
stats, journalism, etc. we'd prefer those going into a tab system." —
`App.jsx` had grown to 44 flat sections in one flex-wrap scroll across
many individual build sessions; "what kind of thing is this" was only
answerable by reading each card.

---

## What was built

Read every component's own header comment (not guessed from its name)
to categorize honestly, then grouped 41 of the 44 sections into 7 tabs:

| Tab | Count | Sections |
|---|---|---|
| Games | 9 | DrillDown, Multiview, WeatherPoll, VenueGeocodeRace, ScoreFeed, PollDeltaFeed, StandingsDrawer, LocalNoteLayer, DayComparison |
| Picks | 7 | PickEm, PickStreak, Calibration, CompareToRelay, Agreement, CrossCheck, History |
| Stats | 4 | Seasons, Stats, MultiDayStreak, MultiDateTrend |
| Journalism | 1 | JournalismBrief |
| Social | 3 | Presence, TeamAffinitySync, Ground |
| System | 2 | ReactivePerfPanel, LatencyHistogram |
| Lab | 15 | Every pure SolidJS-mechanism demo (SuspenseDemo, CreateRootDemo, ErrorBoundaryDemo, TransitionDemo, ContextDemo, SelectorDemo, LazyBoundaryDemo, PropsDemo, DateBrowserTransition, ComputedDemo, IndexArrayDemo, UndoStackDemo, WorkerBridgeDemo, ReplayDemo, ReorderCost) |

**HealthPanel, AmbientPanel, and DeskCard stay outside the tab system,
always-on** -- three deliberate exceptions, not oversights:
- HealthPanel's own header comment already argues a health check nobody
  has to click to see isn't monitoring anything.
- AmbientPanel and DeskCard are tightly coupled (AmbientPanel calls
  DeskCard's `setHighlightedGameId` directly) and both feed
  `print.css`'s "picks on top, games below" export, which has always
  assumed both are simultaneously present -- a constraint a
  single-active-tab system can't satisfy if they land in different
  tabs (Journalism and Games).

Reused the existing `Tabs` primitive (already proven in Seasons/PickEm/
DayComparison/Stats) rather than inventing new tab-bar logic. Switching
tabs unmounts the inactive tab's sections instead of CSS-hiding them --
the same pattern those four components already use internally -- so
polling loops in inactive tabs (WeatherPoll's `setInterval`,
JournalismBrief's 5m cadence) genuinely stop rather than running
unseen.

Simplified the print stylesheet: it used to enumerate 5 section classes
by name to hide (`.pickem`, `.seasons`, `.ground`, `.dayComparison`,
`.suspenseDemo`) -- already stale, missing the other 36 sections. Now
hides the whole `.tabNav`/`.tabbedContent` region outright, which can't
drift as sections move between tabs.

---

## CodeRabbit findings -- 3 total across 2 rounds, all addressed

1. **Major: print stacking regression.** `.spine` (the new wrapper
   around HealthPanel/AmbientPanel/DeskCard) stayed `display: flex`
   under print with no override -- the three panels would print side by
   side instead of stacked ("picks on top, games below" degrading to
   "picks next to games"). Added `.spine { display: block }` to the
   print media query. Verified via Playwright's print-media emulation:
   Desk's top is below Ambient's bottom, same left edge.

2. **Two more findings, both self-inflicted by fixing #1's companion
   accessibility work:** wiring `role="tabpanel"`/`aria-controls` for
   the new top-level nav (a real, separate accessibility gap CodeRabbit
   flagged first) initially made `Tabs` unconditionally emit
   `aria-controls` on every tab button. But every `Tabs` consumer in
   this repo only ever mounts its ACTIVE tab's panel -- so inactive
   tabs' `aria-controls` referenced elements that don't exist in the
   DOM at all, and Seasons/PickEm/DayComparison/Stats (which have never
   rendered a matching tabpanel element) had it dangling even for their
   "active" tab. Fixed by making `aria-controls` opt-in via a `hasPanel`
   prop, emitted only for the currently active tab. App.jsx opts in
   (it's the one consumer that built a matching panel);
   Seasons/PickEm/DayComparison/Stats don't, preserving their exact
   pre-existing behavior rather than gaining a new dangling reference.
   Verified via Playwright: active top-level tab's `aria-controls`
   always resolves to a real element; every other `Tabs` instance in
   the app emits none at all.

Also applied from the same review round: roving tabindex (WAI-ARIA APG
tabs pattern -- only the active tab is a normal Tab-key stop; arrow
keys/Home/End move both focus and selection), which benefits all 5
`Tabs` consumers since the mechanism lives in the shared primitive.
Amended a code comment to name the state-loss side of unmounting
(ScoreFeed's filter, Multiview/ReorderCost's counters,
LazyBoundaryDemo's loaded chunk all reset on tab switch), not just the
poll-stopping side.

Skipped: syncing `activeTab` to the URL (CodeRabbit's own "low value"
nitpick -- a new deep-linking feature, not a defect in this PR, out of
scope for a visual reorganization).

---

## Verification

`npm run build` clean at every stage. Playwright against the real dev
server confirmed: exact tab counts (9/7/4/1/3/2/15, summing to 41, +3
always-on = 44, matching the original section count with nothing lost
or duplicated); HealthPanel/AmbientPanel/DeskCard visible on all 7
tabs; roving-tabindex keyboard navigation (ArrowRight on the Games tab
moves focus AND activates Picks); ARIA id-pairing correctness; the
print-stacking fix; and that the other 4 pre-existing `Tabs` consumers
(Seasons/PickEm/DayComparison/Stats) are unaffected by any of the
accessibility changes -- no ID collisions, no new dangling references,
confirmed by inspecting their internal tab bars directly.

---

## Files changed

| Path | Status |
|------|--------|
| `src/App.jsx` | restructured — spine/tabNav/tabbedContent layout, 7 `<Show>`-gated tab groups |
| `src/App.module.css` | modified — column layout, `.spine`/`.tabNav`/`.tabbedContent`, simplified print rules |
| `src/components/Tabs/index.jsx` | extended — `tabId()`/`panelId()` exports, roving tabindex, opt-in `hasPanel` aria-controls wiring |

---

## What this does NOT change

- Seasons/PickEm/DayComparison/Stats's own internal tab bars are
  unchanged in behavior (they gained roving tabindex for free via the
  shared primitive, but no new panel wiring or aria-controls -- that
  remains a pre-existing, documented, out-of-scope gap for those four).
- No component's own internal logic changed -- this is purely a
  navigation/layout reorganization at the App level.
