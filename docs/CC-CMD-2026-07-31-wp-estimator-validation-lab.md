# CC-CMD-2026-07-31-wp-estimator-validation-lab

**Repo:** field-playground
**Branch:** main — commit directly, do not create a feature branch or PR
**Note:** field-playground is normally exempt from CC-CMD ceremony
(direct chat commits are the default there). This one is explicitly
routed through Claude Code instead, per direct instruction — apply the
same rigor as a production CC-CMD, not a lighter playground pass.

One-liner:
```
git remote get-url origin | grep -q field-playground || { echo "WRONG REPO"; exit 1; }
git pull. Read docs/CC-CMD-2026-07-31-wp-estimator-validation-lab.md. Execute all tasks.
Do not commit unless confidence >= 95. If score < 95, report verbatim and stop.
```

---

## Why this exists

Two real gaps, found in chat earlier: NBA's real win-probability path
(`fetchESPNWinProb`) is unreachable dead code today — gated on
`!FIELD_V2_SOURCES.nba`, which never fires since NBA is confirmed on V2.
MLS and EPL have no native win-probability model anywhere in ESPN's API
at all (confirmed directly, live, for both leagues — `winprobability`
key absent from the schema, pre-game and post-game). A prior session
already recommended the right fallback for exactly this situation
("a Savant-style logistic model on score+period+clock, computed
client-side") but never built or tested it.

**This CC-CMD's job is to build that estimator and find out honestly
whether it's trustworthy — not to assume it will be.**

## The method, precisely

MLB is the one sport with a real, now-correctly-scaled ground truth
(`fetchSavantGameFeed`, fixed today — divides Savant's raw 0-100 by 100,
confirmed live). Use MLB as the test bed: build a simple estimator from
inputs that generalize to other sports (score differential, period/
inning-equivalent, time-remaining-equivalent), fit or calibrate it, then
measure its actual error against Savant's real values on real games.
**If it tracks close on the one sport with ground truth to check
against, that's real evidence for the sports with none. If it doesn't,
that's an equally valid, equally important result — report it plainly,
do not tune the estimator until it looks good against the same data
used to validate it (that would be fitting the test, not testing the
fit).**

---

## Task 1 — Re-verify from HEAD before writing anything (Rule 87)

- Confirm `outbox/mlb-sample-round3.json` (28 real games, real gamePks
  resolvable) still exists and is usable as-is, or re-derive a similar
  real sample fresh if not — do not invent games or dates.
- Re-confirm live, right now, that Savant's raw `homeTeamWinProbability`
  is still 0-100 scale at the source (probe at least one real gamePk
  directly) — this CC-CMD's ground truth depends on knowing the real
  scale precisely, not trusting today's chat findings as still current
  without a fresh check.
- Re-confirm `baseballsavant.mlb.com` is still sandbox-blocked
  (`host_not_allowed`) — if so, this again needs CI-as-proxy, same
  pattern as rounds 1-3.

## Task 2 — Build the estimator

- A pure function: `estimateWinProb({ scoreDiff, periodProgress })` (or
  similar minimal input set) → probability 0-1. Keep the input set
  intentionally small and sport-agnostic — inputs that don't
  generalize to NBA/MLS/EPL defeat the point of this experiment.
- Calibrate it against something real: either a simple hand-tuned curve
  checked against the real Savant data's actual shape, or an actual fit
  (e.g. logistic regression) against real (scoreDiff, periodProgress) →
  (real Savant WP) pairs pulled from the 28-game sample. Prefer the fit
  approach if time allows — it's the more honest test of whether these
  two inputs alone can approximate the real signal.
- This is intentionally NOT `dramaScoreLive`'s `base`/`timeBonus`
  formula repurposed — those were tuned for drama contribution, not
  probability calibration. Build this fresh against real WP data, note
  if the two end up looking similar or different.

## Task 3 — Validate honestly

- For each of the 28 real games (or however many resolve), compute the
  estimator's output at multiple real points in the game and compare
  against Savant's REAL win probability at the same real point (aligned
  by score state, not assumed to be the same array index — ESPN's
  play-by-play and Savant's play sequence are not guaranteed to line up
  1:1).
- Report the actual error (mean absolute error against real Savant
  values, or similar) — a real number, not a qualitative "looks close."
- If the error is large or the estimator clearly fails in some
  identifiable situation (e.g. extra innings, very early innings), say
  so plainly. A negative result here is a genuinely valuable outcome —
  it means the estimator idea needs rethinking before it goes near
  production, which is exactly the kind of thing this playground
  experiment exists to catch cheaply.

---

## Explicitly NOT in scope

- Do not wire this into any live playground UI component yet — that's
  a separate, later piece (the "Live WP Ticker" idea from the same
  chat thread), gated on this validation actually holding up.
- Do not propose or write anything for jubilant-bassoon/field-relay-nba
  — this stays a playground experiment until proven.
- Do not silently tune the estimator to make the validation numbers
  look better — report what the honest first pass produces.

---

## Outbox

`outbox/cc-session-2026-07-31-wp-estimator-validation-lab.md`: the
estimator's actual formula/coefficients, the real validation error
against real Savant data, and a plain verdict — trustworthy enough to
build on, not trustworthy, or trustworthy only in some situations
(state which ones).
