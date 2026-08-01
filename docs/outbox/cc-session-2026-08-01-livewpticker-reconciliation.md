# CC Session Outbox — LiveWpTicker: same-play reconciliation via atBatIndex join

**Date:** 2026-08-01

---

## What was asked

Confirmed scope from "Now for MLB WP too, first" → both: (1) this —
tighten `LiveWpTicker`/`WpSourceBadge`'s reconciliation of real Savant
WP vs. the client-side estimate for MLB live games — and (2) the
wpBonus-fix resolution probe (`docs/outbox/cc-session-2026-08-01-
wpbonus-fix-resolution.md`).

## The gap

`fetchLiveState(gamePk)` read only the LAST play in MLB Stats API's
`allPlays`. `fetchSavantWp(gamePk)` read only the LAST entry in
Savant's `gameWpa` array. Two independently-polled feeds, each picking
its own feed's most-recent point — not guaranteed to be the same real
play. The Δ line ("Δ Npp live vs Savant") implied a same-moment
comparison it couldn't actually promise.

## The fix

Both fetchers now return their FULL data (`fetchMlbPlays` returns an
`atBatIndex -> {homeScore, awayScore, inning, halfBottom}` map;
`fetchSavantWpa` returns the full array) instead of just the last
entry. A new `joinSamePlay` walks Savant's array backward looking for
the newest `atBatIndex` the live feed also has a play for — `atBatIndex`
was confirmed a 100%-reliable shared key across 28 real full games in
`scripts/probe-wpbonus-fix-resolution.mjs` (this session, same day),
so reusing it here isn't a new unverified assumption.

When a join succeeds, `estimatedWp` and `savantWp` are both read from
the exact same real play. When it can't (one feed down, or — early in
a game — no `atBatIndex` overlap yet), it falls back to each source's
own independent latest, same as the original behavior, but now marks
`synced: false` and the UI says so explicitly ("unsynced — feeds not
yet joined at a shared play") rather than silently implying a match
that isn't guaranteed. When synced but the join landed behind Savant's
own newest entry, a note states how many plays behind ("joined N plays
behind Savant's own latest").

No blending: `estimatedWp` is still computed independently via
`estimateWinProb()`, `savantWp` is still Savant's own real number —
the join only guarantees which play's score/inning and WP get
compared, not what either number is.

---

## Verified

- `npm run build` — clean.
- Local browser tests (Playwright, mocked real-shaped MLB Stats API +
  Savant responses, dev mock's own live "Boston Red Sox @ NY Yankees"
  game):
  - **Synced scenario**: live feed's newest play at `atBatIndex 5`,
    Savant one play ahead at `atBatIndex 6`. Confirmed the row used
    `atBatIndex 5`'s Savant value (65%), NOT Savant's own newest entry
    (70%) — proving the join actually overrides each source's naive
    "latest," not just in theory. Correctly showed "joined 1 play
    behind Savant's own latest."
  - **Unsynced fallback scenario**: Savant's array given no overlapping
    `atBatIndex` at all. Confirmed it fell back to each source's own
    latest (live feed's `atBatIndex 5` for score/inning, Savant's own
    last entry for WP) and correctly labeled the Δ line "unsynced."
  - A second live MLB row with an unmocked team (Astros @ Rangers)
    correctly showed "unable to load: no real gamePk resolved,"
    confirming per-row independent failure still works unaffected.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/LiveWpTicker/index.jsx` | modified — atBatIndex join, `synced`/`playsBehindSavant` surfaced |
| `src/components/LiveWpTicker/LiveWpTicker.module.css` | modified — `.syncNote` |
| `docs/outbox/cc-session-2026-08-01-livewpticker-reconciliation.md` | new — this doc |
