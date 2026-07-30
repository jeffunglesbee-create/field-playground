#!/usr/bin/env python3
"""
Validates whether a continuous drama-scoring formula produces meaningfully
more resolution than the current step-function formula, using REAL
historical game states — not synthetic data.

WHY THIS EXISTS: dramaScoreLive() in jubilant-bassoon/src/legacy/field.js
(confirmed by direct source read, ~line 21827) builds its score from three
components — base (score closeness), timeBonus (time urgency), sitBonus
(situational flags) — every one of them a step function or a sum of flat
conditional bonuses. Confirmed live: a 50-game MLB leaderboard pull showed
only two distinct peak values (68 x39, 74 x11); a 5-game NBA sample showed
exactly one (52 x5). That's the algorithm's own structure, not a leaderboard
or relay bug — the relay stores drama_peak verbatim with no rounding
(confirmed: `.bind(drama_peak, ...)`, no Math.round anywhere in
field-relay-nba/src/index.js's write path).

RESULT OF THE FIRST RUN, 2026-07-30: NO IMPROVEMENT. 25 real MLB games
(13 extra-innings, 12 regular), old formula 4 distinct peaks / 25 (16%),
new continuous formula also 4 distinct / 25 (16%), 0 tier reclassifications.
Root cause: almost every real MLB game touches a tied or one-run score at
SOME point across 500-700+ plays, so `base` saturates near its ceiling for
nearly every game regardless of curve shape. Taking the PEAK (max) across
an entire game's states washes out formula smoothness entirely — the
summary statistic itself discards almost all the variation before the
formula's shape can matter. See
docs/outbox/chat-update-2026-07-30-drama-scoring-granularity.md for the
full writeup, including a second hypothesis (recovering discarded
sustainedMinutes/trend data) that was also checked against real archived
games and also did not pan out.

WHAT THIS SUGGESTS, NOT YET TESTED: the real lever is likely scoring
something computed from the WHOLE arc shape (time-weighted integral,
sustained-above-threshold duration, volatility) rather than a single peak
point. Reuse this script's fetch/sample infrastructure to test that next
— replace old_formula/new_formula with a peak-based vs. integral-based
comparison rather than two peak formulas.

THIS SCRIPT DOES NOT DECIDE THE PRODUCTION FORMULA. It answers one
question with real data at a time. Final calibration is a production
CC-CMD decision, made after seeing real numbers — not before.

DATA SOURCE: real ESPN play-by-play via field-relay-nba's own
/espn-summary proxy (ESPN_SUMMARY_RELAY in field.js), confirmed reachable
directly from the chat sandbox — field-relay-nba.jeffunglesbee.workers.dev
is already in the egress allowlist, so no CI-as-proxy workflow is needed
for this investigation. Game IDs are real espn_event_id values pulled
from /context/date for actual finalized MLB games, not invented.

METHOD: for each sampled game, fetch every scored play from ESPN's real
play-by-play, build a full historical-state sequence (home/away score,
inning), then run BOTH formulas across the identical sequence and take
each one's PEAK. Same games, same states, same order — the only variable
is the formula.

USAGE: requires /tmp/mlb_sample.json — a JSON array of
{id, date, matchup, went_to_ot} objects with real espn_event_id values.
Build that first from /context/date/{date} for a range of real dates,
filtering to sport=='MLB' and finalized_at truthy.
"""

import json
import time
import urllib.request
from statistics import mean

RELAY = "https://field-relay-nba.jeffunglesbee.workers.dev/espn-summary"
OUT_PATH = "/tmp/drama_scoring_validation_result.txt"

lines = []
def log(s):
    lines.append(s)
    print(s)
    # Flush every line to disk — a script killed mid-run should still
    # leave whatever it had already computed, not lose everything.
    try:
        with open(OUT_PATH, "w") as f:
            f.write("\n".join(lines))
    except Exception:
        pass


# ── Sample selection ─────────────────────────────────────────────────────
# went_to_ot=1 games first (the class most likely to hit the ceiling
# already observed: extra-innings + a close score is exactly the
# "base high, timeBonus high" combination that produces 68/74 repeatedly)
# plus regular finalized games for contrast, so the sample isn't
# cherry-picked toward only the interesting case.
SAMPLE = json.load(open("/tmp/mlb_sample.json"))
ot_games = [g for g in SAMPLE if g.get("went_to_ot")][:13]
reg_games = [g for g in SAMPLE if not g.get("went_to_ot")][:12]
games = ot_games + reg_games


# ── Fetch real historical states ─────────────────────────────────────────
def fetch_states(espn_event_id):
    """Direct Python port of fetchMLBHistoricalStates (field.js). Same
    filter (wallclock present), same field mapping — verified against the
    same endpoint that function calls."""
    url = f"{RELAY}/sports/baseball/mlb/summary?event={espn_event_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "field-drama-validation/1.0"})
        data = json.loads(urllib.request.urlopen(req, timeout=15).read())
    except Exception as e:
        return None, str(e)[:80]
    plays = data.get("plays", [])
    states = [
        {
            "homeScore": p.get("homeScore", 0),
            "awayScore": p.get("awayScore", 0),
            "period": (p.get("period") or {}).get("number", 1) if isinstance(p.get("period"), dict) else (p.get("period") or 1),
        }
        for p in plays if p.get("wallclock")
    ]
    return states, None


# ── OLD formula: exact port of dramaScoreLive's MLB branch ──────────────
# Line-by-line from field.js ~L21827-21940 (base/timeBonus) and
# ~L21645-21675 (sitBonus's MLB branch). Situational fields (runners,
# outs, count) are NOT present in ESPN's play-by-play the way live
# in-game state carries them, so sitBonus is approximated at 0 here for
# BOTH formulas — this keeps the comparison fair (isolating base+
# timeBonus, which is where the confirmed coarseness lives) rather than
# claiming a sitBonus reproduction this script can't actually verify.
def old_formula(state):
    diff = abs(state["homeScore"] - state["awayScore"])
    period = state["period"] or 1

    if diff == 0: base = 1.0
    elif diff == 1: base = 0.85
    elif diff == 2: base = 0.55
    elif diff <= 4: base = 0.28
    else: base = 0.08

    if period >= 10: time_bonus = 22
    elif period >= 9: time_bonus = 16
    elif period >= 7: time_bonus = 7
    else: time_bonus = 0

    return base * 100 + time_bonus


# ── NEW formula: continuous replacement ──────────────────────────────────
# CONFIRMED NOT SUFFICIENT ON ITS OWN — see module docstring. Kept as-is
# (not deleted) because it's the honest negative result, and the next
# investigation should build on WHY this failed, not silently disappear it.
def new_formula(state):
    diff = abs(state["homeScore"] - state["awayScore"])
    period = state["period"] or 1

    # Linear decay, clamped. diff=0 -> 1.0, decays to a floor of 0.05 by
    # diff=8+. Simple and monotonic; a smoother (e.g. exponential) curve
    # is a reasonable alternative — this is intentionally the plainest
    # version that still fixes the resolution problem in isolation.
    # CONFIRMED: fixing this in isolation does NOT fix the archived peak's
    # resolution, because peak-taking dominates over formula shape.
    base = max(0.05, 1.0 - diff / 8.0)

    if period <= 6:
        time_bonus = 0.0
    else:
        time_bonus = min(22.0, (period - 6) * 5.5)

    return base * 100 + time_bonus


def tier(score):
    if score >= 80: return "fire"
    if score >= 60: return "hot"
    if score >= 40: return "warm"
    return "cold"


# ── Run ────────────────────────────────────────────────────────────────
log(f"validated_at: {time.strftime('%Y-%m-%dT%H:%M:%SZ')}")
log(f"sample: {len(games)} real finalized MLB games ({len(ot_games)} extra-innings, {len(reg_games)} regular)")
log(f"source: real ESPN play-by-play via field-relay-nba's own /espn-summary proxy")
log("")

old_peaks, new_peaks_rounded, new_peaks_raw = [], [], []
tier_changes = []
fetch_failures = []

for g in games:
    states, err = fetch_states(g["id"])
    if err:
        fetch_failures.append((g["matchup"], err))
        log(f"SKIP  {g['matchup']} ({g['date']})  fetch failed: {err}")
        time.sleep(0.5)
        continue
    if not states:
        fetch_failures.append((g["matchup"], "no wallclock-tagged plays"))
        log(f"SKIP  {g['matchup']} ({g['date']})  no usable states")
        continue

    old_scores = [round(old_formula(s)) for s in states]
    new_scores_raw = [new_formula(s) for s in states]
    new_scores_rounded = [round(x) for x in new_scores_raw]

    old_peak = max(old_scores)
    new_peak_r = max(new_scores_rounded)
    new_peak_raw = max(new_scores_raw)

    old_peaks.append(old_peak)
    new_peaks_rounded.append(new_peak_r)
    new_peaks_raw.append(new_peak_raw)

    ot_marker = " [OT]" if g.get("went_to_ot") else ""
    changed = tier(old_peak) != tier(new_peak_r)
    if changed:
        tier_changes.append((g["matchup"], tier(old_peak), tier(new_peak_r)))

    log(
        f"{'CHANGED' if changed else 'ok     '}  {g['matchup']:32s}{ot_marker:5s} "
        f"{len(states):4d} states  old={old_peak:3d} ({tier(old_peak):4s})  "
        f"new={new_peak_r:3d} raw={new_peak_raw:6.2f} ({tier(new_peak_r):4s})"
    )
    time.sleep(0.4)  # be a good citizen against our own relay

log("")
log("=== DISTRIBUTION ===")
log(f"games successfully scored: {len(old_peaks)} / {len(games)}")
if fetch_failures:
    log(f"fetch failures: {len(fetch_failures)}")
    for m, e in fetch_failures:
        log(f"  {m}: {e}")

if old_peaks:
    log(f"OLD (step function)  — distinct peak values: {len(set(old_peaks))} / {len(old_peaks)} games")
    log(f"                       values: {sorted(set(old_peaks))}")
    log(f"NEW (continuous, rounded) — distinct peak values: {len(set(new_peaks_rounded))} / {len(new_peaks_rounded)} games")
    log(f"                       values: {sorted(set(new_peaks_rounded))}")
    log(f"NEW (continuous, raw/unrounded) — distinct peak values: {len(set(new_peaks_raw))} / {len(new_peaks_raw)} games")
    log(f"                       (rounding is what re-introduces some collision — raw is the true resolution)")
    log("")
    log(f"tier changes (old tier != new tier, same game): {len(tier_changes)}")
    for m, ot, nt in tier_changes:
        log(f"  {m}: {ot} -> {nt}")
    log("")
    log(f"old peak range: {min(old_peaks)}-{max(old_peaks)}  mean {mean(old_peaks):.1f}")
    log(f"new peak range: {min(new_peaks_rounded)}-{max(new_peaks_rounded)}  mean {mean(new_peaks_rounded):.1f}")
else:
    log("No games successfully scored — cannot report a distribution.")

log("")
log("=== VERDICT ===")
if old_peaks:
    old_res = len(set(old_peaks)) / len(old_peaks)
    new_res = len(set(new_peaks_raw)) / len(new_peaks_raw)
    log(f"resolution (distinct/total): old {old_res:.0%} -> new(raw) {new_res:.0%}")
    log("If tier_changes is non-empty, those specific games are the ones a")
    log("production switch would visibly reclassify — worth eyeballing each")
    log("one before any threshold recalibration, not just trusting the count.")
