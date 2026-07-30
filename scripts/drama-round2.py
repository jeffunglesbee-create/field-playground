#!/usr/bin/env python3
"""
Round 2. Peak-of-game was tested and failed (16% -> 16% resolution,
see validate-drama-scoring.py). This tests two DIFFERENT candidates
against the same real 25-game sample, both computed from the FULL score
sequence rather than a single instantaneous max:

1. SUSTAINED LATE CLOSENESS -- "how long has the game stayed close
   relative to the approaching end." Not a single peak instant, and not
   a flat average over the whole game either (which would under-weight
   a tense finish equally with a boring middle) -- the fraction of
   LATE-game states (period >= 7) where the score stayed within 1-2
   runs. A game that closes within the final innings scores higher than
   one that was briefly tied in the 3rd and then blew open.

2. COMEBACK MAGNITUDE -- the largest deficit the EVENTUAL winner overcame
   at any point in the game. Wire-to-wire 1-run games and 8-run
   comebacks that finish 1-run apart currently produce near-identical
   scores under any diff-based formula, because diff-based scoring only
   looks at the CURRENT gap at each instant, never the trajectory.

Both are genuinely different axes from "peak," not smoothed versions of
it -- this is the actual test of whether they add real resolution.

RESULT OF THE FIRST RUN, 2026-07-30: both confirmed. Sustained-late
44% distinct (11/25) vs peak's 16% (4/25). Comeback 20% distinct (5/25),
range 0-7 runs, genuinely independent of sustained-late (see the doc
for a game with comeback=7 but sustained_late=73%, distinct from
neighbors at comeback=0-1, sustained_late=100%). The decisive evidence:
8 games sharing an identical peak of 100 showed sustained_late values
spanning the ENTIRE 0.0-100.0% range -- the full distinction was hidden
inside one bucket peak could not see at all.
See docs/outbox/chat-update-2026-07-30-drama-scoring-round2.md for the
full writeup, including the rivalry/opponent-identity trace (real
precedent exists in field.js, precisely disconnected from drama scoring
today) and the season/stakes-context gap (no historical standings path
found via the obvious parameter).
"""

import json
import time
import urllib.request
from statistics import mean

RELAY = "https://field-relay-nba.jeffunglesbee.workers.dev/espn-summary"
OUT_PATH = "/tmp/drama_round2_result.txt"

lines = []
def log(s):
    lines.append(s)
    print(s)
    try:
        with open(OUT_PATH, "w") as f:
            f.write("\n".join(lines))
    except Exception:
        pass


SAMPLE = json.load(open("/tmp/mlb_sample.json"))
ot_games = [g for g in SAMPLE if g.get("went_to_ot")][:13]
reg_games = [g for g in SAMPLE if not g.get("went_to_ot")][:12]
games = ot_games + reg_games


def fetch_states(espn_event_id):
    url = RELAY + "/sports/baseball/mlb/summary?event=" + str(espn_event_id)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "field-drama-round2/1.0"})
        data = json.loads(urllib.request.urlopen(req, timeout=15).read())
    except Exception as e:
        return None, str(e)[:80]
    plays = data.get("plays", [])
    states = [
        {
            "home": p.get("homeScore", 0),
            "away": p.get("awayScore", 0),
            "period": (p.get("period") or {}).get("number", 1) if isinstance(p.get("period"), dict) else (p.get("period") or 1),
        }
        for p in plays if p.get("wallclock")
    ]
    return states, None


def old_peak(states):
    """Same as round 1's old_formula, peak-of-game, for a side-by-side baseline."""
    best = 0
    for s in states:
        diff = abs(s["home"] - s["away"])
        if diff == 0: base = 1.0
        elif diff == 1: base = 0.85
        elif diff == 2: base = 0.55
        elif diff <= 4: base = 0.28
        else: base = 0.08
        p = s["period"] or 1
        tb = 22 if p >= 10 else 16 if p >= 9 else 7 if p >= 7 else 0
        best = max(best, base * 100 + tb)
    return round(best)


def sustained_late_closeness(states):
    """Fraction of late-game states (period>=7) where diff<=2. 0-100 scale.
    A game with no period>=7 states returns 0 rather than dividing by zero."""
    late = [s for s in states if (s["period"] or 1) >= 7]
    if not late:
        return 0.0
    close_late = [s for s in late if abs(s["home"] - s["away"]) <= 2]
    return round(100 * len(close_late) / len(late), 1)


def comeback_magnitude(states):
    """Largest deficit the EVENTUAL winner overcame, at any point in the
    game. Signed differential = home - away, tracked across the full
    sequence; winner determined by the FINAL state."""
    if not states:
        return 0
    final = states[-1]
    home_won = final["home"] > final["away"]
    diffs = [s["home"] - s["away"] for s in states]
    if home_won:
        worst = min(diffs)
        return max(0, -worst)
    else:
        worst = max(diffs)
        return max(0, worst)


log("round2_at: " + time.strftime("%Y-%m-%dT%H:%M:%SZ"))
log("sample: " + str(len(games)) + " real finalized MLB games (" + str(len(ot_games)) + " extra-innings, " + str(len(reg_games)) + " regular)")
log("testing: peak (baseline) vs sustained-late-closeness vs comeback-magnitude")
log("")

peaks, sustaineds, comebacks = [], [], []
rows = []

for g in games:
    states, err = fetch_states(g["id"])
    if err or not states:
        log("SKIP  " + g["matchup"] + "  " + (err or "no states"))
        time.sleep(0.4)
        continue

    pk = old_peak(states)
    sc = sustained_late_closeness(states)
    cb = comeback_magnitude(states)

    peaks.append(pk); sustaineds.append(sc); comebacks.append(cb)
    rows.append((g["matchup"], g.get("went_to_ot"), pk, sc, cb))

    ot_marker = " [OT]" if g.get("went_to_ot") else ""
    log("%-32s%-5s %4d states  peak=%3d  sustained_late=%5.1f%%  comeback=%2d runs" % (
        g["matchup"], ot_marker, len(states), pk, sc, cb
    ))
    time.sleep(0.4)

log("")
log("=== RESOLUTION COMPARISON ===")
log("games scored: " + str(len(peaks)) + " / " + str(len(games)))
if peaks:
    log("PEAK             -- distinct: %d/%d (%.0f%%)  values: %s" % (
        len(set(peaks)), len(peaks), 100 * len(set(peaks)) / len(peaks), sorted(set(peaks))
    ))
    log("SUSTAINED LATE %% -- distinct: %d/%d (%.0f%%)  range: %.1f-%.1f" % (
        len(set(sustaineds)), len(sustaineds), 100 * len(set(sustaineds)) / len(sustaineds),
        min(sustaineds), max(sustaineds)
    ))
    log("COMEBACK RUNS    -- distinct: %d/%d (%.0f%%)  range: %d-%d" % (
        len(set(comebacks)), len(comebacks), 100 * len(set(comebacks)) / len(comebacks),
        min(comebacks), max(comebacks)
    ))

log("")
log("=== DOES SUSTAINED-LATE SEPARATE GAMES PEAK CANNOT? ===")
by_peak = {}
for m, ot, pk, sc, cb in rows:
    by_peak.setdefault(pk, []).append((m, sc, cb))
for pk in sorted(by_peak):
    entries = by_peak[pk]
    if len(entries) > 1:
        log("peak=" + str(pk) + " (" + str(len(entries)) + " games tied on peak):")
        for m, sc, cb in entries:
            log("    %-32s sustained_late=%5.1f%%  comeback=%2d" % (m, sc, cb))

log("")
log("=== VERDICT ===")
log("If games tied on PEAK show real spread in sustained_late or comeback,")
log("those two axes are adding genuine resolution peak alone cannot provide")
log("-- confirming the framing that peak stays as ONE input, not the whole")
log("answer, combined with these as separate signals rather than replaced.")
