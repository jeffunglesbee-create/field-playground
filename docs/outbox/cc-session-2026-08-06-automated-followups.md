# CC Session Outbox — the open follow-ups, automated and then actually run

**Date:** 2026-08-06

---

## What was asked

"Automate follow-ups," then mid-turn: "Use GitHub actions runner for sandbox blocks."

Three verification questions were left open by the soccer/anomaly thread, each one carried forward as a
sentence in a doc rather than an answer. All three are now scheduled probes **and** have been run once
against real data. Two other open items turned out to need no automation at all — they were closed
outright.

---

## Closed outright, no automation needed

Both gaps the previous outbox left open came from the same cause: the client repo was not attached to
this session. It is public, so a read clone resolved both in one step.

| Open item | Status |
|---|---|
| `ADR-002-CONTEXT.md` "not present in either repo — every quotation is second-hand" | **Closed.** Read at `jubilant-bassoon/docs/ADR-002-CONTEXT.md`. Every second-hand quotation checked out verbatim. |
| `fetchESPNWinProb` "no hits in either repo — may be a misremembering" | **Closed.** Real, in `src/legacy/field.js`, `index.html`, `smoke.js`, `field_smoke.js`. Not a misremembering. |

Reading the primary source also surfaced something the second-hand citations had flattened. PROHIBITED
#4 does not merely forbid a system-determined verdict — it names the sanctioned mitigation inline:
*"If the system alone decides 'must watch' **without the Drama Dial mediating the threshold**, that's
the patent's claim structure."* A user-controlled threshold is the documented escape hatch, not an
inference. And Defense 4 pins the amnesty zone to a testable condition — `state === 'final'` or
`'post'` — with a note tying `'326`'s "the rating...has changed" trigger directly to the `drama_peak`
immutability guard. One coherent posture, and the anomaly design fits inside it.

---

## The three automated follow-ups

All weekly, all `workflow_dispatch`-able, all committing real output to `outbox/`. Weekly rather than
daily on purpose: two of the three test for events that don't happen every day, and a daily cadence
would mostly produce no-signal runs the probe would then have to explain away.

### 1. `soccer-penalty-corruption-scope` — **BUG STILL LIVE, and now scoped**

The penalty-dropping bug was confirmed on 4 matches on one date. That sample could say the bug was real;
it could not say which archived rows are corrupted. The 537-row MLB reset→refill precedent needs a
reviewable target list, not an estimate.

**Real result, 30-day window:**

```
real games in window:            613
real soccer games:               178
  ...carrying an espn_event_id:   60   (only these are checkable)
  ...WITHOUT one:                118   <- unverifiable by this method, reported not hidden

real scoring events (scoringPlay === true): 179
kept by the relay's real filter:            162
DROPPED:                                     17   (9.5% of real goals)

16 of 60 profiled games carry a corrupted drama_arc
```

Every one of the 17 dropped events is `"Penalty - Scored"`. The probe emits each corrupted row with its
`game_id`, `espn_event_id`, current `drama_peak`, and **the clock at which corruption begins** — e.g.
`England @ France 2026-07-18, drama_peak=78, corruption begins at 87'`. That last field matters: a
dropped goal doesn't lose one event, it makes every subsequent arc value wrong, so the first drop is
where the row stops being trustworthy.

The 9.5% rate is close to the 11% measured on the original 4-match sample — different window, different
matches, same order of magnitude.

It also guards its own conclusion. `0 dropped` is only reported as CLEAN if the window actually
contained a droppable event type; otherwise it says NO SIGNAL and refuses to read as green. Once a fix
ships, that is the difference between "the fix works" and "no penalty happened this week."

**Unrelated data-quality finding, recorded not fixed:** every corrupted row's `game_id` is prefixed
`FIFA World Cup 2026_` — including plainly MLS fixtures (`New England @ CF Montréal`, `LAFC @ Vancouver`,
`Kansas City @ St. Louis`). This is consistent with the hygiene probe's "fifa world cup, 59 games"
bucket and means the soccer sport labels are not reliable for per-sport bucketing. Relevant to the
anomaly baseline, which buckets per sport.

### 2. `bsd-incidents-shape` — **CONFIRMED**, after the probe's own first verdict was wrong

The preferred fix (source soccer states from BSD `/incidents/` instead of accumulating filtered ESPN
goals) rested entirely on a June 26 doc claiming every incident carries `home_score`/`away_score`. The
same doc's ESPN field list had already been measured stale in this session, so the claim needed
measuring.

**The first run returned NOT CONFIRMED — and that verdict was wrong.** It judged fill rate across all
117 incidents (22%) and called the fields too sparse. But substitutions, cards, period markers and
injuryTime have no reason to carry a scoreline; counting them dilutes the rate toward zero *by
construction*. The fix reconstructs the score at each **goal**, so goal incidents are the only
denominator that means anything. Cross-tabulating by type:

```
  type              n     home_score      away_score
  substitution     55    0/55  (  0%)     0/55  (  0%)
  card             26    0/26  (  0%)     0/26  (  0%)
  goal             14   14/14  (100%)    14/14  (100%)
  period           12   12/12  (100%)    12/12  (100%)
  injuryTime       10    0/10  (  0%)     0/10  (  0%)
```

**100% of real goal incidents carry both fields.** The preferred fix is viable on measured data. The
running score is given per incident, so there is no accumulation step and no goal-type filter — which is
what makes the dropped-goal bug class *structurally impossible* rather than merely patched.

Two further measured results: the June 26 field list is **fully accurate here** (`claimed but ABSENT:
(none)`) — unlike its ESPN section — and it *under*-reports, with 9 real undocumented fields including
`reason` (`Foul`, `Simulation`, `Argument`, `Persistent fouling`) and `added_time`. `goal_type` carries
`regular | penalty` explicitly, which is the exact distinction the ESPN filter fails on.

Note that event `209914` — the ID prior work confirmed reachable for `/shotmap` — returned **0
incidents**. Direct-ID reachability for one route does not imply it for another.

### 3. `golf-zero-leakage` — **NO LEAK**, but the mechanism I first gave was wrong

Golf `drama_peak` is 0 because `classifySport()` returns `'other'`, which has no historical-states
fetcher — drama is never computed. The open risk was whether those rows surface as "maximally boring"
rather than "not measured."

The probe runs the **real** predicates (`analyzeGameArc`, `computeLeverageIndex`) via an esbuild bundle
of `src/data`, rather than re-implementing them — a re-implementation would only prove the copy agrees
with itself. Non-predicate dependencies are stubbed narrowly, and the stub fails loudly on a missing
export (it did, during development, which is how I know).

**Real result:** 26 golf-family rows (`golf` 20, `PGA Tour` 6), all still `drama_peak = 0`.
`analyzeGameArc()` admits **0 of 26**; `computeLeverageIndex()` admits **0 of 26**. Nothing reaches
TheUnwatched or HallOfSurprises.

**My first verdict attributed this to the arc-length threshold. That was wrong**, and the probe's own
output disproved it: all 26 rows carry an **object-shaped** `drama_arc`, so they are stopped earlier, at
`analyzeGameArc`'s `Array.isArray(arc)` guard — the length check is never reached. The probe now derives
the mechanism from the measured shape instead of asserting it.

The mechanism matters because it sets what the all-clear is worth. Rejection is a **side effect** —
nothing in the codebase says "golf is unscored, exclude it." A component reading `drama_peak` directly,
or a relay change writing an array-shaped arc for golf, opens the leak with nothing to catch it. Hence
scheduled, not run once.

---

## Two of three automated verdicts did not survive their own data

Worth stating plainly rather than burying, because it is the same failure mode this session has been
correcting all along, and this time it was mine twice in one turn:

| Probe | First verdict | After checking it against its own output |
|---|---|---|
| BSD incidents | NOT CONFIRMED — "too sparsely filled" | **CONFIRMED** — wrong denominator; 100% on goals |
| Golf leakage | NO LEAK via arc-length check | **NO LEAK via `Array.isArray` guard** — right answer, wrong mechanism |
| Soccer scope | BUG STILL LIVE | unchanged — held up |

The BSD one is the serious one: it would have downgraded the structurally-better fix to "unproven" and
sent the remediation down the fallback path on a measurement artifact. The tell was visible in the raw
counts before the cross-tab existed — 26 rows carried a score, and `goal(14) + period(12) = 26`.

Both are now fixed in the scripts, so the scheduled runs report correctly rather than needing this doc
as an erratum.

---

## What is NOT automated, and why

- **Soccer penalty fix (go/no-go).** Human decision. It lives in `field-relay-nba`, where a push to
  `scripts/**` auto-deploys, and correcting history collides with the `drama_peak` immutability guard —
  whose stated rationale is `'326` claim 1's "the rating...has changed" trigger. Both probes are
  deliberately read-only.
- **Historical reset→refill.** Same reason. The target list now exists; executing it does not follow
  automatically from having it.
- **The anomaly build.** Unblocked, but it is feature work, not follow-up verification.
- **The ~6 residual non-golf `drama_peak == 0` rows.** Still unadjudicated. Small enough to read by
  hand; not worth a scheduled job.

---

## Confidence gate

**94/100.** Every claim is measured on real data through CI, and the two wrong verdicts were caught
against the probes' own output and re-run to confirm the correction rather than asserted. The soccer
corruption list is a reviewable per-row artifact, not an estimate, and the BSD cross-tab is exact
(14/14, 12/12, 0/55, 0/26, 0/10).

The 6-point deduction, specifically:
- **118 of 178 real soccer games carry no `espn_event_id`** and are unverifiable by this method. The
  16-of-60 corruption count is a floor on the checkable subset, not a population census.
- BSD `/incidents/` was measured on **6 real MLS events plus one that returned nothing** — enough to
  settle the load-bearing question at 100%, not enough to be a coverage claim across competitions.
- The `FIFA World Cup 2026_` mislabeling of MLS fixtures is reported but not investigated; it may affect
  per-sport bucketing beyond soccer.
- The golf all-clear is real for today and structurally weak for tomorrow, by its own finding.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-soccer-penalty-corruption-scope.mjs` | new |
| `scripts/probe-bsd-incidents-shape.mjs` | new, then corrected (denominator) |
| `scripts/probe-golf-zero-leakage.mjs` | new, then corrected (mechanism) |
| `scripts/data/golf-leakage-entry.js` | new — re-export surface so esbuild bundles the real predicates |
| `.github/workflows/soccer-penalty-corruption-scope-probe.yml` | new — weekly + dispatch |
| `.github/workflows/bsd-incidents-shape-probe.yml` | new — weekly + dispatch |
| `.github/workflows/golf-zero-leakage-probe.yml` | new — weekly + dispatch |
| `.gitignore` | `.probe-tmp/` |
| `outbox/soccer-penalty-corruption-scope-*.txt` | real CI result |
| `outbox/bsd-incidents-shape-*.txt` (2 runs) | real CI results, before and after the correction |
| `outbox/golf-zero-leakage-*.txt` (2 runs) | real CI results, before and after the correction |
| `docs/outbox/cc-session-2026-08-06-automated-followups.md` | new — this doc |
