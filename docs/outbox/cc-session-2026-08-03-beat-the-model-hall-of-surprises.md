# CC Session Outbox — Beat the Model + Hall of Surprises

**Date:** 2026-08-03

---

## What was asked

Build #2 ("Beat the Model") and #4 ("Hall of Surprises") from the
original four-feature pitch, approved with an explicit confidence
gate. Only the titles survived an earlier context compaction — the
original pitch text was not recoverable from Drive or the institutional
codex (both searched, zero hits). Confirmed my best-guess
interpretation with the user via `AskUserQuestion` before building
rather than guessing silently:

- **Beat the Model**: a blind-guess game against real archived games —
  guess a real game's drama tier before it's revealed, running local
  accuracy record.
- **Hall of Surprises**: a browsable hall-of-fame gallery ranked by the
  biggest real gap between a game's early read and where it ended up.

---

## Real-data validation before building

Hall of Surprises's natural second direction — a real game that looked
hot/fire early or mid-game but fizzled by the end — is NOT expressible
from TheUnwatched's already-validated direction (early-tier-undervalues-
peak). Rather than assume it exists, ran a real CI probe
(`scripts/probe-hall-of-surprises-fizzle-check.mjs`) against a real,
current 30-game sample. Result: **zero real fizzle instances found**
(`outbox/hall-of-surprises-fizzle-check-2026-08-03T03-28-11-480Z.txt`).
Correctly dropped that direction rather than shipping it as if it
reflected real, observed games — stated honestly in the component's own
header comment and its user-facing copy, not silently omitted.

---

## What was built

- `src/data/dramaArcAnalysis.js` — extracted TheUnwatched's early-
  window/gap analysis into a shared module (`analyzeGameArc`), so Hall
  of Surprises uses the same real implementation instead of an
  independently maintained second copy. `TheUnwatched/index.jsx`
  retrofitted to import it; behavior unchanged, verified by screenshot.
- `src/data/relay.js` — two new resources, `beatTheModelCandidates` and
  `hallOfSurprisesCandidates`, each with their own signal/fetch,
  independent from `unwatchedCandidates`/`dramaLeaderboard` for the
  same reason those two are already independent (reshuffling one
  consumer's sample should never affect another's fetch). Same real
  endpoint, `limit=30` and `limit=50` respectively.
- `src/data/beatTheModel.js` — local-only running-score store
  (localStorage, own key, deliberately NOT `outcomes.js` — that
  module's shape is read directly by 4 existing components for a
  different domain, pregame W/L picks). Honestly scoped: no shared
  leaderboard, since `window.storage`'s shared mode doesn't exist for
  this session (confirmed 2026-08-02).
- `src/components/BeatTheModel/` — guess-then-reveal game: shows a
  real matchup/score/date, withholds `drama_peak` until the user picks
  a tier, then reveals the real tier and updates a running local score
  (correct/total, streak, best streak).
- `src/components/HallOfSurprises/` — ranked top-15 gallery from a
  real 50-game sample, medal badges for the top 3, real gap-in-points
  shown per row.
- Both wired into `App.jsx`'s Social tab next to `TheUnwatched`.

---

## Verified

- `npm run build` — clean, 182 modules.
- `node scripts/check-resource-safety.mjs` — clean; its dynamic
  relay.js scan picked up both new resources by name (`beatTheModelCandidates`,
  `hallOfSurprisesCandidates`), confirming it actually inspected the
  new code rather than trivially passing.
- `node scripts/check-unread-memos.mjs` — clean.
- Local browser verification (Playwright, `/opt/pw-browsers/chromium`,
  realistic mocked data matching the real confirmed schema): screenshot
  confirms all three Social-tab panels render correctly — The
  Unwatched (unchanged post-refactor), Hall of Surprises (medal rank,
  gap note, early/final tier badges), Beat the Model (scoreboard,
  4 tier buttons, matchup/score/date). Interaction cycle confirmed:
  guessing a tier reveals the real tier and a correct/incorrect
  message; "Next game" returns to a fresh guessing state.

---

## Confidence: 97/100

Both real data sources this build depends on are proven live (the
`/archive/drama/leaderboard` endpoint, re-confirmed today via the
fizzle-check probe). The one new empirical claim was checked against
real data and found false — correctly not shipped, rather than
assumed. Build, both automated guards, and a real rendered/interactive
browser check all pass. Not 100: real production CI hasn't run yet
(next step after this commit), and the pitch interpretation, though
confirmed by the user, was reconstructed rather than read from the
original source text.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-hall-of-surprises-fizzle-check.mjs` | new — pre-build real-data check |
| `.github/workflows/hall-of-surprises-fizzle-check-probe.yml` | new |
| `outbox/hall-of-surprises-fizzle-check-2026-08-03T03-28-11-480Z.txt` | new — real probe result (negative) |
| `src/data/dramaArcAnalysis.js` | new — shared arc-analysis logic |
| `src/components/TheUnwatched/index.jsx` | modified — uses shared module |
| `src/data/relay.js` | modified — two new resources |
| `src/data/beatTheModel.js` | new — local score store |
| `src/components/BeatTheModel/index.jsx`, `.module.css` | new |
| `src/components/HallOfSurprises/index.jsx`, `.module.css` | new |
| `src/App.jsx`, `src/App.module.css` | modified — wired into Social tab |
| `docs/outbox/cc-session-2026-08-03-beat-the-model-hall-of-surprises.md` | new — this doc |
