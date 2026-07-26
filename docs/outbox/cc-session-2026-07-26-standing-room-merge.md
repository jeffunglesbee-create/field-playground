# CC Session Outbox — Merge Seasons + StandingsDrawer into Standing Room

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#14 (merged)
**Commit:** 33f6fee (squash merge to main)

---

## What was asked

"Seasons and standingsdrawer can be combined as they serve the same
information. Rooted in solid.js. Not an optional request. Not to be
parsed. Automate follow-ups. No fallbacks, only fixes." — a directive,
not a question: merge the two components for real, not a cosmetic
rename.

---

## What was found

`Seasons` and `StandingsDrawer` read the exact same live resources
(`mlbStandings`/`mlsStandings` -- `StandingsDrawer`'s own header comment
already said as much) to answer two genuinely different questions about
the same subject: "what does the whole league table look like" (Seasons'
division/conference/group browsing) vs. "how are the two teams in THIS
game doing" (StandingsDrawer's lazy per-row join against today's real
slate, computed only when a row is expanded -- zero new fetch). They
lived in separate top-level App sections despite being the same
underlying information and data source.

---

## What was built

Merged into one component, **Standing Room** (named for the pun on
league standings + stadium standing room -- deliberately not a mechanical
mashup of the two old names), with a **League Tables** / **Today's
Games** view toggle. Neither real mechanism was thrown away:

- **League Tables** is Seasons' MLB (division + Wild Card tabs), MLS
  (Eastern/Western), World Cup (per-group tabs), and the honest
  NFL/EPL "SAMPLE -- no source found" section, verbatim.
- **Today's Games** is StandingsDrawer's lazy per-row join, verbatim --
  including its explicit `{supported, line}` distinction between "no
  standings source for this sport" and "team not found in current
  standings."

While in the file: retrofitted Seasons' own internal MLB-division/
MLS-conference/World-Cup-group tabs off a stale local `Tabs` copy onto
the shared `../Tabs` primitive -- `Tabs.module.css`'s own header comment
already flagged that local copy as dead weight Seasons was still using
instead of the primitive that was originally extracted *from* it.
Deleted the dead copy and its now-provably-unused CSS block rather than
leaving it inert.

`StandingsDrawer` removed from the Games tab (count 9 → 8); Standing
Room keeps Seasons' old slot in the Stats tab. Updated every
cross-reference comment in other components (`JournalismBrief`,
`MultiDateTrend`, `MultiDayStreak`, `DayComparison`, `Stats`, `Tabs`,
`relay.js`) that named "Seasons" as an architectural precedent, so none
point at a component that no longer exists.

---

## CodeRabbit findings -- 1 total, addressed

1. **Real, pre-existing bug, surfaced during review, not introduced by
   the merge:** `GameDrawerRow`'s `homeInfo`/`awayInfo` used
   `createMemo`, which computes its initial value EAGERLY at creation
   (confirmed against SolidJS's own docs) -- not lazily on first read.
   Every game row's standings lookup ran the moment `<For>` mounted it,
   regardless of whether the row was ever expanded, directly
   contradicting the section's own stated reason to exist ("before a
   row is ever expanded, this row's lookup literally never runs").
   Inherited verbatim from `StandingsDrawer`'s original implementation
   during the merge -- present since that component's original build,
   never caught until now. Fixed: replaced with plain accessor
   functions, which only run when actually called. Verified by
   instrumenting `Array.prototype.flatMap` (used inside `mlbLine`):
   with all 8 of today's game rows mounted and collapsed, zero new
   standings-lookup computation occurred; expanding a row triggered
   computation for exactly that row, on demand.

---

## Verification

`npm run build` clean at every stage. Playwright against the real dev
server confirmed: Games tab count correctly 8 (was 9), no
`StandingsDrawer` section left there; Stats tab shows `STANDING ROOM`
with a working League Tables/Today's Games toggle; League Tables view
renders MLB/MLS/World Cup/NFL-EPL-sample correctly; Today's Games view
renders 8 real drawer rows, expand-to-reveal shows real GB/WC standings
lines or the correct "no source"/"not found" fallback text; switching
back to League Tables after visiting Today's Games shows no residual
state issues. `Stats.jsx`'s own cross-reference text confirmed updated
("Same standings data as Standing Room, recomposed...").

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/StandingRoom/index.jsx` | created — merged component |
| `src/components/StandingRoom/StandingRoom.module.css` | created — merged styles |
| `src/components/StandingsDrawer/` | deleted — fully absorbed |
| `src/components/Seasons/` | deleted — fully absorbed (renamed, not just moved) |
| `src/App.jsx` | modified — StandingRoom replaces Seasons in Stats tab, StandingsDrawer removed from Games tab (count 9→8) |
| `src/App.module.css` | modified — `.standingsDrawer` class removed |
| `src/lazyModules.js` / `src/lazyModules.artifact.js` | modified — `SeasonsLazy` replaced by `StandingRoomLazy` |
| `src/components/{DayComparison,JournalismBrief,MultiDateTrend,MultiDayStreak,Stats}/*`, `src/components/Tabs/*`, `src/data/relay.js` | modified — cross-reference comments/UI text updated to Standing Room terminology |

---

## What this does NOT change

- No relay/data-layer changes -- both merged mechanisms read the exact
  same `mlbStandings`/`mlsStandings` resources they always did.
- The other 4 `Tabs` consumers (PickEm, DayComparison, Stats, and now
  Standing Room's own internal MLB/MLS/WC/League-Today toggles) are
  unaffected by this merge beyond Standing Room itself gaining the
  shared primitive where it previously had a stale local copy.
