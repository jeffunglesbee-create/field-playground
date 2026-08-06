# CC Session Outbox — confirmed: scored penalties dropped from soccer drama_arc

**Date:** 2026-08-06

---

## What was asked

"Check docs on drive for soccer events" -- while a CI probe was pending on whether the relay's soccer
goal filter drops scored penalties. The Drive spec and the probe result together settle it.

---

## The bug, confirmed

`field-relay-nba/scripts/drama-backfill.mjs`'s `fetchSoccerHistoricalStates()` reconstructs a soccer
scoreline by filtering ESPN `keyEvents` down to goals:

```js
const keyEvents = (data.keyEvents || []).filter(e => {
  const txt  = (e.type?.text || '').toLowerCase();
  const abbr = (e.type?.abbreviation || '').toLowerCase();
  return txt.includes('goal') || abbr === 'g';
});
```

ESPN labels a scored penalty `"Penalty - Scored"`, which does **not** contain the substring `"goal"`.
The second clause cannot rescue it: the probe simulated the real predicate against every real scoring
event and found **`type.abbreviation` is empty on all 115 real keyEvents**, so `abbr === 'g'` never
matches anything at all.

**Real result across 4 real MLS games (2026-08-01):**

```
real scoring events (scoringPlay === true): 18
kept by the relay's real filter:            16
DROPPED:                                     2   <- both "Penalty - Scored"
```

**11% of the real goals in this sample never enter the score reconstruction.** Because the states array
is built by accumulating goals in sequence, a dropped goal doesn't just lose one event -- **every
subsequent `drama_arc` value in that match is computed from a wrong scoreline**, and so is the
`drama_peak` derived from it. This is shipped data that the app already displays (Hall of Surprises, The
Unwatched, Leverage Index, Fork Point, DramaLeaderboard all consume `drama_arc`).

Full real output: `outbox/situational-enrichment-viability-probe-2026-08-06T01-28-59-466Z.txt`.

---

## The Drive spec confirms this is not intended design

**"FIELD — Soccer Drama Score: Full Breakdown" (May 12, 2026)** is the authoritative soccer drama spec.
It explicitly models the very events the current filter discards:

| Spec'd event | Spec'd effect | In the backfill today |
|---|---|---|
| Goal (any) | `goal_event_modifier: +10`, decaying | score only, no spike |
| **Goal in stoppage time** | `goal_in_stoppage_modifier: +25` -- "the highest single-event drama spike in soccer" | flat `+8` if clock contains `+` |
| **Red card** | `red_card_modifier: +8`, plus sustained `ten_men_defending_modifier: +5` | **not implemented** |
| Penalty shootout | miss `+8`, match-winning `+20`, match-saving save `+25` | **not implemented** |
| Extra time | `et_multiplier: 1.2`, goal in ET `+15` | **not implemented** |

The spec's base tiers also differ from what shipped:

- **Spec:** tied `1.0` · margin 1 `0.85` · margin 2 `0.45` · margin 3+ `0.15`, **plus** `0.90` when
  margin is 1 **and both teams have scored** -- the spec calls this out directly ("2-1 is actually MORE
  dramatic than 1-0 because the losing team has already scored once").
- **Implemented:** `1.0 / 0.72 / 0.32 / 0.06`, with **no** `bothTeamsScored` case at all.

**Honest scoping on that divergence:** the spec describes the *live* drama scorer, while
`drama-backfill.mjs` is the *retroactive* one working only from `keyEvents`. Some divergence is
legitimate -- a backfill genuinely cannot reconstruct live-only state. But two things are not explained
by that: the dropped penalties (a scoreline error, not a modeling choice), and the red-card modifier
(cards demonstrably *are* in `keyEvents` -- the probe observed 12 real Yellow Cards in these 4 games, so
red cards would be equally available; no red card occurred in this sample, so that specific type was not
directly observed).

---

## Recommended fix

Filter on ESPN's own `scoringPlay === true` boolean rather than substring-matching a display string:

```js
const keyEvents = (data.keyEvents || []).filter(e => e.scoringPlay === true);
```

This is strictly more robust: it is ESPN's structured marker for "this event changed the score," and it
caught all 18 real scoring events in the sample where the text match caught 16. It also stops the filter
being sensitive to ESPN's display wording, which is exactly what broke here.

**This has not been applied.** The fix lives in `field-relay-nba`, whose own CLAUDE.md mandates that
every commit goes straight to `main`, and a push touching `scripts/**` triggers a real auto-deploy. It
also **changes historical data**: re-running the backfill would alter `drama_peak`/`drama_arc` for past
soccer matches the app already displays, so it needs a deliberate backfill decision, not a drive-by
commit. Flagged for a go/no-go rather than actioned unilaterally.

---

## Also worth noting

- **Enrichment opportunity, separate from the bug.** The same probe found the soccer filter discards 35
  Substitutions and 12 Yellow Cards per 4 games, and the WNBA fetcher keeps only 4 of 17 real play-object
  fields -- discarding 13 at 91-100% fill (`scoringPlay`, `shootingPlay`, `scoreValue`,
  `pointsAttempted`, `shortDescription`, `coordinate`, `team`, `participants`, ...). Those are *event*
  fields, not persistent *state* like MLB's bases/outs/count, so any bonus would have to be derived from
  event sequences rather than ported directly from the MLB approach.
- **This probe found its own bug first.** Run #1 profiled `data.plays` for soccer and reported "0 real
  plays" -- wrong key entirely; the relay reads `data.keyEvents`. Corrected in run #2, which is what
  surfaced the 18-vs-16 discrepancy that led here.

---

## Confidence gate

**97/100.** The bug is confirmed by simulating the relay's exact predicate against real ESPN data, with
the decisive detail (`type.abbreviation` empty on all 115 events, so the rescue clause is dead) measured
rather than assumed, and cross-checked against ESPN's own `scoringPlay` marker. The Drive spec
independently confirms penalties/cards are meant to carry drama. The 3-point deduction: the sample is 4
real MLS matches on one date, so the 11%-of-goals figure is indicative rather than a population rate, and
no red card appeared in it, so that specific event type was inferred from yellows rather than observed.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-situational-enrichment-viability.mjs` | modified -- corrected to keyEvents, added the decisive predicate simulation |
| `outbox/situational-enrichment-viability-probe-*.txt` (3 runs) | real CI results |
| `docs/outbox/cc-session-2026-08-06-soccer-penalty-scoring-bug.md` | new -- this doc |
