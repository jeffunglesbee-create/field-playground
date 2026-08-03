# CC Session Outbox — fifth-order follow-up: a third real bug class

**Date:** 2026-08-03

---

## What was asked

"Go hunting for a third bug class" — continuing the "automate follow-ups
at as many levels/orders as possible" thread past the first two guards
(the `createResource` re-throw pattern, the unread-`createMemo`
pattern), which both covered real, already-hand-fixed bugs from this
session's own history.

---

## What was found

Hand-audited every real `localStorage` call site in the codebase (24
call sites across 7 files) rather than assuming a pattern. Result: every
file that touches `localStorage` already wraps every call in try/catch
— `PickEm`, `LocalNoteLayer`, `GameSymphonyArchive`, `teamAffinity.js`,
`myServices.js`, `beatTheModel.js` (built earlier today) — except one:
`src/data/outcomes.js`. Its own `load()` helper is guarded, but
`setOutcome`/`clearOutcome`/`clearAllOutcomes`/`setConfidence`/
`clearConfidence`/`setAnnotation`/the `BroadcastChannel` sync handler
all called `localStorage.setItem` directly, unguarded — 10 real call
sites. `outcomes.js` is read directly by 4 other components per its own
header comment (PickRow, Agreement, CrossCheck, DeskCard's untrack
snapshot), so this is live, load-bearing pick-tracking code, not a
rarely-hit path. A real `setItem` throw (Safari private browsing
historically threw on any access; quota exceeded; storage disabled)
would break a real pick-click interaction.

A candidate second bug class was investigated and set aside: a
`Promise.allSettled` batch-fetch pattern where total failure gets
silently collapsed into an empty-but-successful result (this exact
class bit `WeatherPoll` and `VenueGeocodeRace` on 2026-07-26, caught by
CodeRabbit both times). Checked all 5 current real usages — all already
correctly handle the all-failed case, but via two different valid fix
shapes (throw-based in `weather.js`, tag-based in `VenueGeocodeRace`/
`LiveWpTicker`). A textual check reliable enough to not false-positive
on both shapes would need real control-flow reasoning, not a regex
scan — the same "declined, not silently dropped" call already made for
the resource-safety guard's harder case. Stated here rather than
quietly abandoned.

---

## What was built

`scripts/check-localstorage-guards.mjs` — scans every file under `src/`
for `localStorage.getItem/setItem/removeItem` calls occurring outside
any `try { ... }` block, using brace-depth matching to find try-block
ranges (same manual-parsing technique already used in
`check-resource-safety.mjs`'s `splitTopLevelArgs`).

**Validated, not just reasoned about:**
1. Ran against the real codebase first — found exactly the 10 real
   `outcomes.js` violations the manual audit found, zero elsewhere.
2. Reproduced the bug shape in a throwaway file (an unguarded `setItem`
   and `removeItem`) — both caught.
3. Confirmed three legitimate guarded variants (one-line `try {...}
   catch {...}`, multi-line try/catch, and a guarded call mixed with an
   unguarded one in the same file) are handled correctly — the guarded
   ones not flagged, the unguarded one still is.
4. Cleaned up the throwaway file.

Fixed the real bug: `outcomes.js` now routes every write through a
`save(key, value)` helper that wraps `localStorage.setItem` in
try/catch, matching the exact convention already used everywhere else
in this codebase.

**Fault-injected the actual real-world scenario**, not just re-run the
build: simulated a `localStorage.setItem` that throws (`QuotaExceededError`)
and called every write path in the real, fixed `outcomes.js` — all 7
survived. Ran the identical fault injection against the pre-fix version
(via `git show HEAD:...`) and confirmed it actually throws under the
same scenario — proof the regression check is meaningful, not vacuous.

Wired into `.github/workflows/build-check.yml` as a third hard-failure
step, same posture as the other two guards.

---

## Verified

- `npm run build` — clean (182 modules).
- `node scripts/check-localstorage-guards.mjs` — exits 0 against the
  real, fixed codebase.
- `node scripts/check-resource-safety.mjs` / `check-unread-memos.mjs`
  — both still clean (no regression from this round's edits).
- Fault-injection test: fixed `outcomes.js` survives a throwing
  `localStorage.setItem`; pre-fix `outcomes.js` (checked out via `git
  show`) confirmed to actually throw under the identical scenario.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/check-localstorage-guards.mjs` | new — automated unguarded-localStorage guard |
| `src/data/outcomes.js` | modified — real bug fix, all writes routed through a guarded `save()` helper |
| `.github/workflows/build-check.yml` | modified — runs the new guard, third in the chain |
| `docs/outbox/cc-session-2026-08-03-fifth-order-followups.md` | new — this doc |
