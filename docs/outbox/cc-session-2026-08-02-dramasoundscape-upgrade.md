# CC Session Outbox — DramaSoundscape upgrade: new cues + mixer

**Date:** 2026-08-02

---

## What was asked

"Dramasoundscape needs a big upgrade" — clarified via a follow-up
question into two selected directions: (1) more real cue types, (2)
multi-game / richer mixing.

---

## What was built

### 1. Three new cue types, using real fields already available

Added to the shared `src/data/dramaCueEngine.js` (so Game Symphony
Archive's reconstruction gets these for free too, not just the live
component):

- **Walk-off** 🚶 — game just went final, and the immediately-prior
  live state was tied or had the opposite team ahead. A real
  last-moment win, not a lead the winner already held.
- **Photo finish** 🔬 — game ended with a real one-run/one-possession
  margin.
- **Milestone drama** 💎 — *this specific game's* own real `drama_peak`
  crosses into the "fire" tier (≥80, `DeskCard`'s own real threshold,
  reused verbatim) for the first time. Distinct from the existing
  "new hottest" cue, which is a cross-slate ranking comparison, not a
  property of one game.

`milestoneDrama` is undefined-safe by design: it only fires when
`drama_peak` is present on both sides, which is true for the live path
but never true for Game Symphony Archive's reconstructed state shape
(MLB Stats API's play data has no `drama_peak` field) — verified via a
direct unit-style check (`detectCueTransitions` with no `drama_peak`
field present returns no milestone cue), not just assumed safe.

Real sounds added for all three (`cartoonSynth.js` and
`DramaSoundscape/index.jsx`, verbatim-duplicated between the two files
for the same architectural reason the original six are — each file
owns its own synth instance). **Honest caveat, stated in both files'
own comments**: unlike the original six (each tuned through multiple
real-listening passes — "Sounds 8-bit," "sounds are more generic than
fun or silly"), these three have not been through a real-listening
pass yet. Structurally distinct by design (different channel/pattern
combinations), not yet confirmed to actually sound good.

### 2. Multi-game mixer

A new row of chips, one per currently-live game, that pulses for ~1.5s
whenever a real cue fires for that specific game — "which game is
actually making noise right now," not just the most recent single log
line. Reuses the exact same cue-firing path (`markActive` alongside the
existing `pushLog`), so it can't drift out of sync with what the log
already shows.

---

## Verified

- `npm run build` — clean.
- Direct logic check (`detectCueTransitions` called with crafted real-
  shaped state pairs, no browser needed): walk-off correctly fires on
  both the "tied then wins" and "was trailing then wins" cases, and
  correctly does NOT fire when the winner was already leading before
  the final tick; photo finish correctly fires on a real 1-run margin;
  milestone correctly fires on a real 74→82 crossing and correctly does
  NOT fire when `drama_peak` is absent entirely (the archive-
  reconstruction case) — all 6 checks passed.
- Local browser test (Playwright, real dev-mock data): legend renders
  all 9 cue types; the mixer renders with the dev mock's real live
  games (Boston Red Sox @ NY Yankees, Houston Astros @ Texas Rangers);
  no new console errors introduced (only the pre-existing HealthPanel
  demo error and the already-documented CDN-blocked-in-sandbox
  limitation, unchanged from before this session's changes).

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/dramaCueEngine.js` | modified — 3 new cue types (walkOff, photoFinish, milestoneDrama) |
| `src/data/cartoonSynth.js` | modified — 3 new gestures, `CUE_TO_GESTURE` extended |
| `src/components/DramaSoundscape/index.jsx` | modified — 3 new gestures (own copy), mixer store, cue-handling refactored to a lookup table |
| `src/components/DramaSoundscape/DramaSoundscape.module.css` | modified — mixer styles |
| `docs/outbox/cc-session-2026-08-02-dramasoundscape-upgrade.md` | new — this doc |
