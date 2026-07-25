# CC Session Outbox — Personal Product Surfaces
**Date:** 2026-07-25
**PR:** jeffunglesbee-create/field-playground#3 (merged, squash)
**Commit:** 85aa7992fb (squash merge to main)

---

## What was built

Five new standalone product surfaces answering the question "what exists
here that doesn't exist in either source app," plus two behaviors
integrated directly into DeskCard, plus a class of runtime-crash bugs
found and fixed along the way — including one that had already shipped
to the standalone Claude.ai artifact build.

---

### 1. PickStreak — personal performance narrative

**Question:** Nothing in this repo tracks the user's own W/L streak on
their picks — History's `MultiDayRecord` shows per-day totals, but
nothing computes a *current* streak or breaks it down per sport for a
"you're 5-0 on NFL picks this week" narrative.

**Answer:** Built entirely from `outcomes()` (zero new fetch). Current
streak: every W/L outcome, sorted most-recent-date-first (parsed from
the gameId's date prefix), walked from the front counting consecutive
identical results. This-week: last 7 days, grouped by sport (also
parsed from the gameId), rendered as one narrative line per sport.

---

### 2. Calibration — confidence + Brier score

**Question:** History's `TierCalibration` answers a similar question
for FIELD's own editorial tier (A/B/C), but there's no way to compute a
Brier score from three discrete tiers — that needs an actual stated
probability.

**Answer:** Added a `confidence` store to `outcomes.js` (parallel to
`pickMeta`, same separation rationale: outcomes' bare W/L/P shape is
read directly by four existing call sites). Confidence is captured
*retroactively* on already-marked picks (a slider + "set" button per
pending pick), not at pick time — so it works on picks marked before
this feature existed. Once rated, a Brier score (mean squared error
between stated probability and the binary outcome) and a win-rate-by-
confidence-decile chart render, with a target tick at each bucket's own
midpoint so miscalibration is visible at a glance.

**Bug found and fixed during review (CodeRabbit):** the row list for
pending picks was rebuilding fresh `{gameId, result}` objects on every
recompute. Since `<For>` keys by item reference, this remounted every
`ConfidenceCapture` row — including ones with in-progress, uncommitted
slider drafts — every time *any* confidence value changed anywhere.
Fixed with a scoped `Map` cache keyed by gameId, reusing the same
object reference across recomputes for unchanged rows.

---

### 3. CompareToRelay — editorial vs. personal picks

**Question:** AmbientPanel shows the relay's editorial picks; PickEm
shows the user's own game picks. Nothing joins them.

**Answer:** Joins on `game_id`, no new fetch. Editorial picks don't
carry an explicit side field — the winner is implied by the `score`
string format.

**Bug found and fixed during review (CodeRabbit) — this one was real:**
the score string is **away–home** ordered, not home–away as originally
assumed (mirroring DeskCard's own `${displayAway()}–${displayHome()}`
convention). Verified against the mock: `por-sea` has
`home: Seattle, away: Portland, score: '2–1'`, and the mock's own
`morning_report` says *"Portland holding on at Seattle"* — only
consistent if the first number belongs to away. The original ordering
inverted every non-tied winner in both this component and MultiDateTrend.
Fixed centrally in `relay.js`'s now-shared `impliedSide` helper.

---

### 4. LocalNoteLayer — override a confirmed relay field, with staleness detection

**Question:** `local_note` is a confirmed relay field on games. Nothing
surfaces it, let alone lets the user override it.

**Answer:** A different pattern from the optimistic score editor: that
one overwrites a value expected to *converge* with the relay on the
next poll. A `local_note` override is meant to persist indefinitely —
**unless** the relay's own value moves, which signals an editor changed
it upstream, at which point the local edit is stale and drops
automatically. Implementation pins a `relaySnapshot` at override time;
a `createEffect` (not a memo — mutating a store belongs in an effect,
not inside another computation) compares it against the current
`local_note` on every deskStore update and clears the override on
mismatch. Added `local_note` to the dev mock, varying after the first
poll (same pattern as the existing `houTexLive` transition), so the
staleness path is actually exercisable in dev, not just asserted in a
comment.

**Findings from review (CodeRabbit), both fixed:**
- `loadOverrides()` didn't validate the parsed JSON shape — valid JSON
  like `null` or an array would bypass the catch and get handed to
  `createStore` as-is.
- The note-edit trigger was a clickable `div` — unreachable by keyboard.
  Changed to a real `<button>`, and gave the edit `<input>` an
  `aria-label`.

---

### 5. MultiDateTrend — 7-day editorial trend, fixed-size fleet fan-out

**Question:** Fan out `createDayContext` across the past 7 dates in
parallel and aggregate the relay's pick record over those dates — a
genuinely different shape from the single-resource model everything
else uses.

**Answer:** 14 concurrent resources, not one: `createDayContext` per
day (game results) paired with an independent `createResource` per day
(that day's newspaper top pick — `createDayContext` doesn't cover
newspaper on its own). For each day, the editorial top pick's implied
side is checked against the actual result.

**Bug found during review (CodeRabbit), fixed:** `allLoaded()` checked
only `.loading`, so a rejected resource still reached `e.topPick()` /
`e.ctx.data()` and rethrew inside the `trend` memo — with no
`ErrorBoundary` around this panel specifically, one failed day could
have blanked the whole component. Guarded both accessors behind
`.error` checks first, same posture as everywhere else in this session.

---

## Integrated into DeskCard (not new sections)

### Score-differential threshold alert
A watched (★), live game that closes to within N points fires a toast
exactly once, on the crossing — not on every poll while it stays close.
Uses `on(margin, (curr, prev) => ...)` to detect the crossing, mirroring
the existing final-score toast effect's structure. Adds an `alert ≤`
number input next to the live-only filter.

**Bug found during review (CodeRabbit), fixed:** the input declared
`max="99"` but the `onInput` handler only clamped the lower bound —
values above 99 still reached `setAlertThreshold`. Clamped both ends.

### Multi-key URL sync
`relay.js`'s `initUrlDateSync` already round-trips `currentDate` through
`?d=`. Extended the same idea to three more DeskCard-local signals —
`watched`, `liveOnly`, `collapsed` sport groups — inside **one**
`createEffect` that writes all three params together, rather than one
effect per signal each independently doing read-URL → set-one-param →
write-URL. Required hoisting `liveOnly` from `Content()`'s closure to
module scope (it needs to be readable from the sync function) and
exporting `watched`/`collapsed`, which were already module-level stores.

---

## Bugs found and fixed along the way (not requested — found by actually running the app)

Two were caught by browser-testing this batch instead of just running
`npm run build`; a third was flagged in a separate chat session's
screenshot and verified/fixed here.

### PropsDemo — blanked the entire app
`(forwarded via {...rest})` inside JSX children text was parsed as a
spread-children expression against an undefined `rest` at that scope
(children-spread is real JSX syntax; this was meant to be literal
text). Threw on every render, and with no `ErrorBoundary` anywhere
above it in `App.jsx`, this blanked the *entire app*, not just
PropsDemo's own section. Fixed by escaping it as a string literal:
`{'{...rest}'}`.

### Seasons — the real root cause of the original "Seasons disappeared" report
A prior session's fix wrapped `<Seasons>` in an `ErrorBoundary`, on the
theory that an unhandled resource error was silently removing the
subtree. True, but incomplete: `wcStandings()?.groups ?? {}`-style
guards only protect against the resource's *loading* state, not its
*error* state. A resource throws when read while errored — but a
`createMemo` whose computation throws on its **first** run doesn't
reliably re-throw on later reads; it settles into a stale `undefined`
instead. That `undefined` then propagates through a chain of memos
until something finally does `.length` on it, producing an opaque
"Cannot read properties of undefined (reading 'length')" instead of the
real fetch error, at whatever point downstream first touches it.
Traced this live with instrumented `console.log`s inside each memo in a
running dev-server + Playwright session (the logs never fired — proof
the crash happened on a stale re-read, not the live computation).
Fixed by checking `.error` before ever calling the accessor (same
posture `AmbientPanel`/`DeskCard` already use for `ambientData`/
`deskData`), for all three standings resources, with a clear per-
section "Unable to load ... standings." message instead of a permanent
"Loading…".

### The wider version of the same bug — the blank artifact
A separate chat session had independently investigated why the
standalone Claude.ai artifact build (`App.artifact.jsx`) rendered
completely blank, and left a hypothesis in
`docs/outbox/chat-update-2026-07-25-blank-artifact-bug.md`: a sandboxed
iframe's `Origin: null` fails the relay's CORS, every one of the
~13+ concurrent resources fails at once, and with **zero**
`ErrorBoundary` anywhere in `App.artifact.jsx`, the whole tree unmounts
silently (SolidJS tears down the subtree internally rather than firing
`window.onerror`, which is why the console was silent). Verified this
against the actual files — confirmed true. Fixed by:
- adding a top-level `ErrorBoundary` around the whole tree in both
  `App.jsx` and `App.artifact.jsx`, so a resource error that slips past
  every inner guard still renders a visible message instead of nothing
- applying the same `.error`-before-accessor guard to every other
  resource consumer that didn't already have it: `DayComparison`,
  `MultiDayStreak`, `JournalismBrief`

That other session had already pushed its own partial fix (syncing just
the Seasons-level `ErrorBoundary` into `App.artifact.jsx`) directly to
`main` while this PR was open, which produced a real merge conflict —
resolved by keeping this PR's version, since it was a strict superset
(same Seasons fix, plus the new top-level boundary theirs didn't have).

**Finding from review (CodeRabbit), fixed:** the `JournalismBrief`
`.error`-guard fix made `data()` return `undefined` while errored, but
the loading fallback and the error message were siblings in the JSX —
so "Loading…" rendered *alongside* the error instead of being replaced
by it. Nested the loading/content `Show` inside a `!journalismBrief.error`
check to make the two states mutually exclusive.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/PickStreak/index.jsx` + `.module.css` | created |
| `src/components/Calibration/index.jsx` + `.module.css` | created |
| `src/components/CompareToRelay/index.jsx` + `.module.css` | created |
| `src/components/LocalNoteLayer/index.jsx` + `.module.css` | created |
| `src/components/MultiDateTrend/index.jsx` + `.module.css` | created |
| `src/data/outcomes.js` | modified — `confidence` store |
| `src/data/relay.js` | modified — shared `impliedSide` helper |
| `src/components/DeskCard/index.jsx` + `.module.css` | modified — threshold alert, URL sync, exports |
| `src/components/Seasons/index.jsx` | modified — `.error`-guarded standings reads |
| `src/components/PropsDemo/index.jsx` | modified — crash fix |
| `src/components/JournalismBrief/index.jsx` | modified — `.error` guard + exclusivity |
| `src/components/DayComparison/index.jsx`, `src/components/MultiDayStreak/index.jsx` | modified — `.error` guards |
| `src/App.jsx`, `src/App.artifact.jsx` | modified — top-level `ErrorBoundary`, new sections wired |
| `src/App.module.css` | modified — 5 new section class names |
| `vite.config.js` | modified — `local_note` field in dev mock |

Build: clean, both `vite build` and the artifact config
(`vite.config.artifact.js`) verified. Browser-tested with a headless
Playwright pass against the dev server (not just a clean build) —
caught both the PropsDemo and Seasons bugs, neither of which would have
surfaced from `npm run build` alone.

---

## What this does NOT change

- Drag-to-reorder picks was on the requested list but already exists in
  AmbientPanel (`pickOrder`/`handleDragStart`/`handleDrop`) — not
  rebuilt, noted instead
- No changes to PickEm, AmbientPanel, or History's own logic (only
  DayComparison/MultiDayStreak/JournalismBrief got the `.error`-guard
  treatment, since those are the ones that read a resource that can
  actually fail without an existing guard)
- No schema or data model changes beyond the new `confidence` map and
  the mock's new `local_note` field
