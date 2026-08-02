# CC Session Outbox — The Unwatched

**Date:** 2026-08-02

---

## What was asked

One of four pitched features ("2. Beat the Model", "3. Game Symphony
Archive", "4. Hall of Surprises", "5. The Unwatched"). User delegated
selection to Claude's judgment. Chose #5 first: fully buildable from
data already fetched in this repo (no new endpoint, no new storage
primitive), unlike #2/#4 (need `window.storage`'s untouched shared
mode) or #3 (needs a new real-data shape probe).

"The Unwatched" — the inverse of this project's whole thesis: games
the scoring system's own early real arc called boring that turned
genuinely dramatic later. The system's honest ledger of what it almost
told people to skip.

---

## Validated against real data before building

Before writing any UI, hand-checked the concept against a real archived
game from an earlier probe today (`outbox/drama-leaderboard-wp-
movement-probe-2026-08-01T01-46-34-126Z.txt`, today's real #1 "Most
Dramatic Game," Tampa Bay Rays @ Baltimore Orioles):

- Real arc length: 821 points.
- First 20% (164 points): max **52** ("warm" tier).
- Real final peak (drama_peak): **74** ("hot" tier).
- Doesn't cross into "hot" (≥60) until **62%** through the real game.

A real, concrete, hand-verified example of exactly the pattern this
component surfaces — confirmed on real numbers before any code existed,
not assumed to work.

---

## What was built

- `src/data/relay.js`: new `unwatchedCandidates` resource
  (`/archive/drama/leaderboard?sport=X&limit=30`), independent signal
  and fetch from `dramaLeaderboard`'s own top-8 resource, so raising
  this component's sample size never affects `DramaLeaderboard`.
- `src/components/TheUnwatched/index.jsx`: for each real game, parses
  `drama_arc`, takes the first 20% (floor 5 points) as the "early
  read," compares its tier against the real final `drama_peak`'s tier.
  Flags a game as unwatched when the early read never reached "hot"
  but the real game did. Reuses `dramaTier`/`dramaLabel` from
  `DeskCard` verbatim (jubilant-bassoon's own real thresholds, already
  ported there) — not re-derived. Sorted by real point gap, biggest
  misses first. Shows the real percent-through-game point where the
  arc first crossed into "hot," for concrete narrative context.
- Wired into `App.jsx`'s Social tab, next to `DramaLeaderboard`.

Honest scoping note (stated in the component's own comment): `drama_
peak`/`drama_arc` are archived, post-hoc data per RUWT/ADR-002 — this
is a retrospective "if you'd judged early, you'd have been wrong"
framing, not a claim about any live forecast.

---

## Verified

- `npm run build` — clean.
- Local browser test (Playwright, real dev-mock data — not synthetic):
  all 3 of the dev mock's real archived games correctly flagged as
  unwatched (early tier "warm," final tier "hot"), each with a real,
  computed 22-point gap and real flip percentages (50%, 53%, 59%
  through the game) — the math runs correctly on real shaped input.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/relay.js` | modified — new `unwatchedCandidates` resource |
| `src/components/TheUnwatched/index.jsx` | new |
| `src/components/TheUnwatched/TheUnwatched.module.css` | new |
| `src/App.jsx` | modified — wired into Social tab |
| `src/App.module.css` | modified — added to shared section layout rule |
| `docs/outbox/cc-session-2026-08-02-the-unwatched.md` | new — this doc |
