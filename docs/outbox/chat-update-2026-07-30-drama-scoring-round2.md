# chat-update-2026-07-30-drama-scoring-round2

**From:** chat (claude.ai)
**Follows:** chat-update-2026-07-30-drama-scoring-granularity.md
**Status:** two dimensions confirmed with real data; two more investigated
(one precedent found and precisely traced, one real gap found). Nothing
built for production yet.

---

## The reframe that mattered

Round 1 tried to fix peak by smoothing the formula underneath it and
found that doesn't work — peak-of-game saturates because nearly every
real MLB game touches a close score at some point, and taking a max
across hundreds of states destroys the signal no matter how continuous
the formula is.

Jeff's pushback: peak is the right idea, but it needs more inputs —
sustained closeness near the end, season context, comebacks, opponent
identity. Round 2 tests two of those against the same 25-game real
sample (13 extra-innings, 12 regular) used in round 1.

---

## 1. Sustained late-game closeness — CONFIRMED, real resolution gain

Not peak, and not a flat average either (which would under-weight a
tense finish the same as a boring middle). Computed as: the fraction of
late-game states (period >= 7) where the score stayed within 1-2 runs.

**Result: 44% distinct (11/25) vs peak's 16% (4/25).**

**The decisive evidence is inside the games peak COULDN'T separate.**
8 games shared an identical peak of 100. Their sustained-late-closeness
values: 0.0% to 100.0% — the entire possible range, hidden inside one
bucket. Rays@Red Sox stayed within 1-2 runs through every inning 7+;
White Sox@Blue Jays was 0% late despite touching a tie earlier to
trigger the same peak. Peak alone cannot see this distinction; this
metric does.

## 2. Comeback magnitude — CONFIRMED, genuinely independent signal

Largest deficit the eventual winner overcame at any point, tracked from
the signed score differential across the full sequence.

**Result: 20% distinct (5/25), range 0-7 runs.**

Inside the 13-game extra-innings group (all peak=122): Cardinals@
Diamondbacks shows comeback=7 against neighbors at 0-3 — a real 7-run
swing, a fundamentally different KIND of drama (epic comeback) from a
game that was simply tight throughout (comeback=0, sustained_late=100%).
Both peaked identically under the old system.

## 3. Season/stakes context — REAL GAP, not yet buildable

Tried `&date=` on the standings endpoint for historical as-of-date
standings. Response shape identical with or without the param — the
same silently-ignored-parameter pattern that has recurred across this
whole investigation (Overpass, wc/projections). Not proof no path
exists — only that the obvious one doesn't. Getting real historical
standings would need either a different endpoint or FIELD computing its
own standings history from box scores over time. Bigger lift than the
other three; not attempted further this round.

## 4. Opponent identity / rivalry — REAL PRECEDENT, precisely traced, disconnected

`field.js` already has a live regex-based rivalry/stakes detector —
broader than first read, covering MLS Cup Final, conference finals,
Supporters' Shield race, playoff position race, El Tráfico, Hudson
River Derby, Cascadia Derby, "Hell is Real"/Ohio Cup, and final-day
season-destiny games, each returning `{importance, boost, label, icon}`.

**Traced precisely where `.boost` is actually consumed** — two call
sites, both found by direct grep, neither touching drama scoring:
  - one feeds a local variable in an unrelated context
  - the other: `(g.narrative.boost||0)>=20?' narrative-hi':''` — a CSS
    class toggle for BOLD STYLING on a pre-game narrative label

**Confirmed against `dramaScoreLive`'s own body** (read in full in the
prior session): no reference anywhere to `narrative`, `boost`, or
rivalry. The two systems are completely separate today. Rivalry
currently affects how bold a text label looks under a matchup — nothing
about the archived score.

**So extending this into drama scoring is genuinely new wiring**, not
completing an existing connection. The concept and the boost values
already exist and are calibrated (28 for MLS Cup Final down to 12 for
regional rivalries) — that part doesn't need inventing. It needs a new
wire from `narrative.boost` into the score calculation, which doesn't
exist anywhere today.

---

## Where this leaves the four dimensions

| Dimension | Status |
|---|---|
| Sustained late closeness | Confirmed, real gain, computable now |
| Comeback magnitude | Confirmed, independent signal, computable now |
| Season/stakes context | Real gap — no historical standings path found yet |
| Opponent/rivalry | Real precedent exists, precisely disconnected from scoring |

Two of four are ready to prototype with existing data. Two need real
work first — one a data-access investigation, one a genuinely new wire
between two systems that have never been connected.

---

## Files

`scripts/drama-round2.py` — the two new candidate metrics
(sustained_late_closeness, comeback_magnitude), tested against the same
25-game real sample as round 1. Reusable for testing further candidates
against the same games.
