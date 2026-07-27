# CC Session Outbox — WcBracketOdds (Games/Picks/Stats Deep Search)

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#21 (merged)
**Commit:** 3d994e3 (squash merge to main)

---

## What was asked

"Do the deep search" -- on Games/Picks/Stats, the three tabs deferred
earlier in favor of the broad health sweep (PR #20). Expected lower
yield than Journalism/Social/System's deep search, since these three are
the oldest, most-built-out parts of the app.

---

## What was found

Probed several `/wc/*` candidates from the relay's own allowlist family.
`/wc/bracket`, `/wc/traps`, and `/wc/projections` are all real, live, and
rich -- `/wc/projections` is the superset (confirmed via a direct probe:
a Monte Carlo simulation, N=2000, over the real World Cup bracket).

`StandingRoom`'s existing `WcSection` only shows GROUP STAGE standings
-- nothing in this app surfaced knockout-stage projections until now.
`/wc/projections` fills that gap: per-team championship probability
(with real FIFA rank), plus a genuinely surprising **bracket traps**
signal -- real cases (Germany, Netherlands, Croatia, Japan, confirmed
live) where finishing 2nd in a group gives a team a *higher*
championship probability than finishing 1st, because the resulting
knockout path is easier. That's computed relay-side from the
simulation, not derived client-side.

Two other candidates checked and ruled out: `/odds-story/today` (403
"Odds path not allowed" -- genuinely not real at that guessed sub-path)
and `/circadian/state` (400, needs a `phase` param the exact name/format
of which wasn't found before deciding the return was diminishing).

---

## What was built

`WcBracketOdds`: top-8 championship odds ranked with a bar chart, plus
the bracket-traps list, mounted in its own `SafeSection` in the Stats
tab right after `StandingRoom`. Static resource (no `currentDate`/sport
param -- the relay itself decides when to recompute the simulation).
Dev mock uses the real captured probe response, trimmed to the top 15
teams (of ~44) and all 4 real `bracketTraps` entries --
`bracketSlots`/`thirdPlaceRanking` omitted since this component doesn't
read them.

---

## CodeRabbit findings -- 1 total, addressed

1. **Real: refresh button's hit area was glyph-sized.** `padding: 0 2px`
   around a 12px icon left too small a touch target. Gave it an explicit
   24×24 hit area with the glyph centered via flexbox. (Noted in the PR:
   this exact pattern is used identically across many other refresh
   buttons in this repo -- QualityReport, DramaLeaderboard,
   RelaySystemStatus, BriefArchive, JournalismBrief all share it. Fixed
   here since it's this PR's own new file; not chased across the
   pre-existing siblings, which is separate scope.)

---

## Verification

`npm run build` clean at both stages. Playwright against the real dev
server confirmed: 8 real teams render with real FIFA ranks and
championship percentages (Spain 4.2% leads), all 4 real bracket-traps
entries render with correct 1st-vs-2nd deltas (Germany: 2.7% vs 4.6%,
"2nd is better by 1.8%"); refresh button's bounding rect confirmed
24×24 after the fix; no console errors; no regression to `StandingRoom`
or `Stats`.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/relay.js` | modified — `wcProjections` resource added |
| `src/components/WcBracketOdds/index.jsx` | new |
| `src/components/WcBracketOdds/WcBracketOdds.module.css` | new |
| `src/App.jsx` | modified — `WcBracketOdds` mounted in its own `SafeSection`, Stats tab, right after `StandingRoom` |
| `src/App.module.css` | modified — `.wcBracketOdds` added to shared section layout class list |
| `vite.config.js` | modified — real captured `/wc/projections` mock |

---

## What this does NOT change

- No relay/data-layer changes -- `/wc/projections` already existed and
  was already live; this only surfaces it client-side.
- `StandingRoom`'s own `WcSection` is unmodified -- `WcBracketOdds` is a
  separate, complementary component, not a rewrite of the existing
  group-stage view.
