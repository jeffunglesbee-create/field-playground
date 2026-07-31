#!/usr/bin/env python3
"""
Round 3. Direct extension of round 2, not new infrastructure. Round 2
proved sustained_late_closeness and comeback_magnitude add real
resolution using a crude score-diff proxy. The Drive/chat search
surfaced a May 2026 NFL spec whose real insight is methodological: real
win-probability-added beats a score-diff proxy. MLB already has real WP
data confirmed live in production (fetchSavantGameFeed, field.js
~L17407) -- this tests whether swapping the proxy for the real thing
sharpens round 2's already-confirmed metrics further, using the exact
same 25-game sample.

TWO HOSTS NEEDED, NEITHER reachable from the chat sandbox (confirmed:
"Host not in allowlist" for baseballsavant.mlb.com -- a SANDBOX
rejection, not a Savant one; same shape as every other CI-as-proxy case
today). GitHub Actions runners reach both directly.

  statsapi.mlb.com     -- resolve games to a real MLB gamePk (Savant
                          needs gamePk, not ESPN event ID). Reuses the
                          EXACT endpoint shape already proven in
                          field.js's fetchMLBSchedule -- not guessed.
  baseballsavant.mlb.com/gf?game_pk=N -- real per-play win probability,
                          d.scoreboard.stats.wpa.gameWpa[], confirmed
                          live shape from field.js's own
                          fetchSavantGameFeed (same field names:
                          homeTeamWinProbability,
                          homeTeamWinProbabilityAdded).

METHOD: for each of round 2's 25 real games (scripts/data/mlb-sample-
25.json), resolve gamePk by matching date + team names against the real
schedule, fetch the real gameWpa array, then compute:
  wpa_sustained_late -- fraction of late-game plays where win
                        probability stayed within 15pp of 50/50
  wpa_swing_total     -- sum of |wpa| across all plays (mirrors the NFL
                        spec's total_wpa_movement)
  wpa_comeback        -- largest win-probability deficit the eventual
                        winner faced at any point (0-100 scale, real
                        probability rather than a run-count proxy)

Compared directly against round 2's saved sustained_late_closeness (44%
distinct, 11/25) and comeback_magnitude (20% distinct, 5/25) for the
SAME games.
"""

import json
import time
import urllib.request

OUT_PATH = "outbox/drama-round3-wpa-result.txt"
lines = []
def log(s):
    lines.append(s)
    print(s)
    try:
        with open(OUT_PATH, "w") as f:
            f.write("\n".join(lines))
    except Exception:
        pass

UA = "field-drama-round3-wpa/1.0 (github.com/jeffunglesbee-create/field-playground; research)"
MLB_STATS_BASE = "https://statsapi.mlb.com/api/v1"
SAVANT_BASE = "https://baseballsavant.mlb.com"

SAMPLE = json.load(open("scripts/data/mlb-sample-25.json"))


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return json.loads(urllib.request.urlopen(req, timeout=15).read())


def resolve_game_pk(date, away, home):
    """Real MLB Stats API schedule lookup -- same endpoint shape as
    field.js's own fetchMLBSchedule, not invented. Matches by date and
    a loose substring check on team names (relay names vs Stats API
    names can differ in exact form, e.g. 'Athletics' vs 'Oakland
    Athletics')."""
    url = MLB_STATS_BASE + "/schedule?sportId=1&date=" + date
    try:
        d = fetch_json(url)
    except Exception as e:
        return None, str(e)[:80]
    for datew in d.get("dates", []):
        for g in datew.get("games", []):
            h = g.get("teams", {}).get("home", {}).get("team", {}).get("name", "")
            a = g.get("teams", {}).get("away", {}).get("team", {}).get("name", "")
            if (home.split()[-1] in h or h.split()[-1] in home) and \
               (away.split()[-1] in a or a.split()[-1] in away):
                return g.get("gamePk"), None
    return None, "no schedule match"


def fetch_savant_wpa(game_pk):
    url = SAVANT_BASE + "/gf?game_pk=" + str(game_pk)
    try:
        d = fetch_json(url)
    except Exception as e:
        return None, str(e)[:80]
    wpa_arr = (d.get("scoreboard") or {}).get("stats", {}).get("wpa", {}).get("gameWpa", [])
    if not wpa_arr:
        return None, "empty gameWpa"
    return wpa_arr, None


def normalize_wp_scale(wpa_arr):
    """SCALE FIX (2026-07-31): Savant's raw API returns homeTeamWin-
    Probability/Added on a 0-100 scale (confirmed live: 52.2, not
    0.522) -- the exact bug this round's own raw diagnostic dump first
    caught (a 9230-scale comeback value on what field.js's comment
    claims is a 0-1 fraction). jubilant-bassoon fixed fetchSavantGameFeed
    itself the same day (divides by 100 at the source). Every formula
    below (wpa_comeback's `50 - worst*100`, wpa_sustained_late's
    `abs(wp-0.5)<=0.15`) was written assuming a 0-1 input -- normalizing
    once here, at the single read point, keeps them correct without
    touching each formula individually, same principle as production's
    own fix (fix the source, not each consumer)."""
    out = []
    for p in wpa_arr:
        q = dict(p)
        if q.get("homeTeamWinProbability") is not None:
            q["homeTeamWinProbability"] = q["homeTeamWinProbability"] / 100
        if q.get("homeTeamWinProbabilityAdded") is not None:
            q["homeTeamWinProbabilityAdded"] = q["homeTeamWinProbabilityAdded"] / 100
        out.append(q)
    return out


def wpa_sustained_late(wpa_arr):
    """Fraction of the SECOND HALF of the play sequence (proxy for
    late-game) where win probability stayed within 15 percentage points
    of 50/50 -- the WPA-based equivalent of round 2's score-diff-based
    sustained_late_closeness."""
    n = len(wpa_arr)
    if n < 4:
        return 0.0
    late = wpa_arr[n // 2:]
    close = [p for p in late if abs((p.get("homeTeamWinProbability") or 0.5) - 0.5) <= 0.15]
    return round(100 * len(close) / len(late), 1)


def wpa_comeback(wpa_arr):
    """Largest win-probability deficit the eventual winner faced, on a
    0-100 scale (mirrors comeback_magnitude's run-count but in real
    probability terms)."""
    if not wpa_arr:
        return 0.0
    final_wp = wpa_arr[-1].get("homeTeamWinProbability")
    if final_wp is None:
        return 0.0
    home_won = final_wp >= 0.5
    wps = [p.get("homeTeamWinProbability") for p in wpa_arr if p.get("homeTeamWinProbability") is not None]
    if not wps:
        return 0.0
    if home_won:
        worst = min(wps)
        return round(max(0, 50 - worst * 100), 1)
    else:
        worst = max(wps)
        return round(max(0, worst * 100 - 50), 1)


def wpa_swing_total(wpa_arr):
    total = 0.0
    for p in wpa_arr:
        v = p.get("homeTeamWinProbabilityAdded")
        if v is not None:
            total += abs(v)
    return round(total, 3)


log("round3_at: " + time.strftime("%Y-%m-%dT%H:%M:%SZ"))
log("sample: " + str(len(SAMPLE)) + " games (round 2's real sample, re-used)")
log("purpose: does REAL win-probability sharpen round 2's already-confirmed metrics?")
log("")

resolved = 0
gamepk_failures = []
savant_failures = []
rows = []
dumped_raw = False

for g in SAMPLE:
    away, home = g["matchup"].split(" @ ")
    pk, err = resolve_game_pk(g["date"], away, home)
    if err or not pk:
        gamepk_failures.append((g["matchup"], err or "no pk"))
        log("SKIP  " + g["matchup"] + "  gamePk resolution failed: " + str(err))
        time.sleep(0.3)
        continue

    wpa_arr, err2 = fetch_savant_wpa(pk)
    if err2 or not wpa_arr:
        savant_failures.append((g["matchup"], err2 or "empty"))
        log("SKIP  " + g["matchup"] + "  gamePk=" + str(pk) + "  Savant failed: " + str(err2))
        time.sleep(0.5)
        continue

    if not dumped_raw:
        dumped_raw = True
        log("")
        log("=== RAW DIAGNOSTIC DUMP (first resolved game, TRUE raw values, before normalizing) ===")
        log("field.js's own comment claims homeTeamWinProbability is a 0-1 fraction.")
        log("CONFIRMED (2026-07-31, cross-verified against jubilant-bassoon's own same-day")
        log("audit) it is actually 0-100 -- the 9230-scale comeback value below is exactly")
        log("that bug, not noise. normalize_wp_scale() below corrects it before any metric")
        log("is computed; this dump is kept as the honest historical record of the raw shape.")
        for i, p in enumerate(wpa_arr[:3] + wpa_arr[-3:]):
            log("  entry " + str(i) + ": " + json.dumps(p))
        log("=== END RAW DUMP ===")
        log("")

    wpa_arr = normalize_wp_scale(wpa_arr)
    resolved += 1
    sl = wpa_sustained_late(wpa_arr)
    cb = wpa_comeback(wpa_arr)
    sw = wpa_swing_total(wpa_arr)
    rows.append((g["matchup"], g.get("went_to_ot"), len(wpa_arr), sl, cb, sw))

    ot = " [OT]" if g.get("went_to_ot") else ""
    log("%-32s%-5s gamePk=%-8s %4d plays  wpa_sustained_late=%5.1f%%  wpa_comeback=%5.1f  wpa_swing=%.2f" % (
        g["matchup"], ot, pk, len(wpa_arr), sl, cb, sw
    ))
    time.sleep(0.5)

log("")
log("=== RESOLUTION SUMMARY ===")
log("resolved with real Savant WP data: " + str(resolved) + " / " + str(len(SAMPLE)))
if gamepk_failures:
    log("gamePk resolution failures: " + str(len(gamepk_failures)))
    for m, e in gamepk_failures:
        log("  " + m + ": " + str(e))
if savant_failures:
    log("Savant fetch failures: " + str(len(savant_failures)))
    for m, e in savant_failures:
        log("  " + m + ": " + str(e))

if rows:
    sls = [r[3] for r in rows]
    cbs = [r[4] for r in rows]
    log("")
    log("=== DISTRIBUTION ===")
    log("wpa_sustained_late -- distinct: %d/%d (%.0f%%)  range: %.1f-%.1f" % (
        len(set(sls)), len(sls), 100 * len(set(sls)) / len(sls), min(sls), max(sls)
    ))
    log("wpa_comeback       -- distinct: %d/%d (%.0f%%)  range: %.1f-%.1f" % (
        len(set(cbs)), len(cbs), 100 * len(set(cbs)) / len(cbs), min(cbs), max(cbs)
    ))

log("")
log("=== VERDICT ===")
log("Compare the distinct-value counts and ranges above against round 2's")
log("saved result (sustained_late_closeness 44% distinct, comeback_magnitude")
log("20% distinct, both on the same 25-game sample). If real WP data produces")
log("comparable or better resolution using the SAME underlying concept, that")
log("confirms the NFL spec's methodological insight generalizes to MLB. If")
log("resolution is similar to the proxy, the crude score-diff version may")
log("already be capturing most of the real signal for THIS purpose.")
