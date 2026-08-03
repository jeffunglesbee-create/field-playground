# CC Session Outbox — third field-validity sweep: BSD xG (inconclusive)

**Date:** 2026-08-03

---

## What was asked

Continuing the validity sweep: BSD's `expected_goals`/`ball_possession`
fields, rendered by `BsdXgPanel` with only a nullish fallback and no
range check.

---

## Result: inconclusive, reported honestly rather than forced

`scripts/probe-bsd-xg-validity.mjs` queried `/bsd/events/season?
league_id=1&limit=50&offset=0` to collect a sample of real event IDs to
check — real code path already used by `BsdXgPanel` for the same
purpose. It returned **zero results**, so no `shotmap` fetches ever
ran. Not treated as a pass ("no violations found" would be misleading
when nothing was actually checked) — the probe's own verdict correctly
labeled this `INCONCLUSIVE`, not `CONFIRMED VALID`.

This doesn't contradict `BsdXgPanel`'s own documented finding
(`/bsd/events/season`'s `season=` filter doesn't work, but the endpoint
itself has returned real results before — event 383, West Ham 3-0
Leeds, cited in that component's own header comment). Getting zero
results at `offset=0` today, with no `season=`/`date=` param supplied
at all, is a new, narrower observation this probe surfaced, not
previously checked. Root-causing it (is `league_id=1` wrong without a
season context, is this a real regression, is pagination behaving
differently than when `BsdXgPanel` was built) is a real follow-up, not
attempted here to keep this round's scope to what was asked
(field validity), not a new BSD investigation.

---

## Where the validity sweep stands

| Field | Result |
|---|---|
| `drama_peak`/`drama_arc` | ✅ confirmed valid, 110 real games |
| MLB standings (`gamesBack`/`wildCardGamesBack`/`divisionRank`) | ✅ confirmed valid, 90 real records |
| Savant `homeTeamWinProbability` | ✅ confirmed valid, 713 real entries |
| BSD `expected_goals`/`ball_possession` | ⚠️ inconclusive — zero real events resolved this pass |
| FPL player fields, LaLiga numeric fields, `quality_report` thresholds | not yet attempted |

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-bsd-xg-validity.mjs`, `.github/workflows/bsd-xg-validity-probe.yml` | new |
| `outbox/bsd-xg-validity-probe-*.txt` | new — real, inconclusive probe result |
| `docs/outbox/cc-session-2026-08-03-third-field-validity-sweep.md` | new — this doc |
