# Real API Surface — field-playground

A single reference for every real external host/route this project
actually touches, compiled 2026-08-02 from this session's own real
probes plus direct inspection of merged code (including work by
concurrent sessions this same day). Written because the surface had
grown large enough — BSD, FPL, LaLiga APIM, football-data.org,
Bundesliga bapi, MLB Stats API, Savant, Open-Meteo, geocoding — that no
single place listed it, its real constraints, or how confident each
entry actually is. Update this file when a new real host/route is
confirmed; don't let it go stale the way it didn't previously exist.

**Confidence key:** 🟢 confirmed live by a real probe this session (file
cited) · 🟡 confirmed live via merged code inspection, not independently
re-probed by this entry's author · 🔴 known broken/unreliable for a
specific documented reason.

---

## Proxied through field-relay-nba (`field-relay-nba.jeffunglesbee.workers.dev`)

| Route | Confidence | Notes |
|---|---|---|
| `/context/date/{date}` | 🟢 | Core slate data — games, scores, drama_peak, streams. |
| `/archive/drama/leaderboard?sport=X&limit=N` | 🟢 | Real `drama_arc` (JSON-string array), `drama_peak`. No `limit` cap hit yet at 30. |
| `/archive/query?date=X` | 🟢 | Journalism brief archive. |
| `/journalism/brief` | 🟢 | 5-minute cadence, `cycleId`-based regeneration detection. |
| `/quality/report`, `/health` | 🟢 | |
| `/mlb-stats/standings?leagueId=103,104&season=Y&date=D` | 🟢 | **`date=` genuinely filters** (docs/outbox/cc-session-2026-08-01-mlb-standings-viability.md) — 5/5 distinct real records across 5 real dates tested. `gamesBack`/`eliminationNumber`/`magicNumber`/`clinched` all real, string-typed, `"-"` = leading (not missing). |
| `/mls/stats/competitions/MLS-COM-000001/seasons/MLS-SEA-0001KA/standings` | 🟡 | Wired in relay.js, not independently re-probed this pass. |
| `/wc/standings`, `/wc/projections` | 🟡 | |
| `/analytics/newspaper/{date}` | 🟡 | |
| `/bsd/events/season?league_id=1&limit=N&offset=N` | 🔴 | **Broken** — `season=` param doesn't filter (docs/outbox/cc-session-2026-08-02-bsd-verification.md): 3 different season values returned identical count + identical first-page dates. |
| `/bsd/events/by-date?date=X` | 🔴 | **Broken** — requested `2026-07-25`, got results dated `2027-05-30`. Same underlying bug as season=. |
| `/bsd/events/{id}/shotmap` | 🟢 | **Reliable** — direct event-ID lookup works correctly. Real fields: `stats.home`/`away` (`expected_goals` etc.), `shotmap`, `momentum`, `average_positions`, `xg_per_minute`. Resolve the real event ID via FPL fixtures + team-name matching, not BSD's own broken search (`BsdXgPanel`'s actual approach). |
| `/fpl/bootstrap-static` | 🟢 | Real teams/players/gameweeks. **Player-level fields (price, ownership %, form, `ict_index`) fetched but never displayed by anything yet** — `BsdXgPanel` only reads team names out of it. |
| `/fpl/fixtures?event=N` | 🟢 | Real per-gameweek fixture list with scores once played. |
| `/laliga-apim/clasificacion` | 🟢 | Real standings, confirmed live via direct network capture (docs/outbox/cc-session-2026-08-02-laliga-network-capture.md) — the real page makes this exact call, HTTP 200. |
| `apim.laliga.com/public-service/api/v1/digitalassets/proximos-partidos` | 🟢 | Upcoming matches. Real, not yet proxied through the relay as far as this doc's author found — `LaLigaCrossCheck` calls `/laliga-apim/` only. |
| `apim.laliga.com/public-service/api/v1/digitalassets/highlight` | 🟢 | Real media/content metadata — a genuinely different data type (not stats) than anything else in this list. **Unused by any component.** |
| `apim.laliga.com/public-service/api/v1/digitalassets/brand-day` | 🟢 | Real, unused. |
| `apim.laliga.com/public-service/api/v1/broadcasters-channels` | 🟢 | Real, unused. |
| `apim.laliga.com/webview/api/web/seasons/opta/{year}/competitions/opta/23/rankings/players/group?stats[]=...` | 🟢 | Real player rankings/leaders (goals, assists, on-target, passes, interceptions, saves). Real, unused. |
| `apim.laliga.com/public-service`/`apim.laliga.com/webview` | 🟢 | Base hosts; real public subscription keys are shipped in every visitor's own page HTML (`__NEXT_DATA__`), not secret. `apim-int.laliga.com` is the internal counterpart — **never contact it**, confirmed its own existence only via passive `__NEXT_DATA__` inspection. |
| `/fd/competitions/PD/standings` | 🟡 | football-data.org, La Liga (`PD`) only. **Other real competition codes (`PL`, `BL1`, `SA`, `FL1`, `CL`) have never been queried** — a real, unexplored expansion of this exact same integration. |
| `/bundesliga-bapi/resolve-dayid?season=Y&date=D` → `/bundesliga-bapi/broadcasts?comId=X&dayId=Y` | 🟡 | Real two-step chain (`BundesligaBroadcasters`), not independently re-probed by this entry's author. |

## Direct client fetch (CORS-open, bypasses the relay)

| Host | Confidence | Notes |
|---|---|---|
| `statsapi.mlb.com/api/v1/schedule` | 🟢 | gamePk resolution via date + team-name matching. |
| `statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live` | 🟢 | Real `allPlays`, real `about.startTime`/`about.inning`, real `result.homeScore`/`awayScore`. |
| `statsapi.mlb.com/api/v1/game/{gamePk}/linescore` | 🟢 | Real live `balls`/`strikes`/`outs`, `currentInning`, `inningState`. |
| `statsapi.mlb.com/api/v1/game/{gamePk}/boxscore` | 🟢 | Real full per-player live stats. |
| `statsapi.mlb.com/api/v1/game/{gamePk}/playByPlay` | 🟢 | Same real plays as the live feed, lighter payload. |
| `statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live/diffPatch?startTimecode=...` | 🟢 | Real incremental diff — `gameEvents`/`logicalEvents` (`midInning`, `countChange`, `game_finished`). **Confirmed real, never used by any component.** |
| `baseballsavant.mlb.com/gf?game_pk={gamePk}` | 🟢 | Real per-play WP (`gameWpa`), `/100` scale fix applied everywhere this is read. `atBatIndex` confirmed a 100%-reliable join key against MLB Stats API's own plays (28/28 real games). |
| `api.open-meteo.com/v1/forecast` | 🟢 | No key, CORS-open, free-tier rate limited. |
| `geocoding-api.open-meteo.com/v1/search` | 🟢 | |
| `esm.sh/webaudio-tinysynth@1.1.3` | 🟢 | Real CDN ESM import for DramaSoundscape/GameSymphonyArchive's synth engine — confirmed loading against the real deployed site by `soundscape-cdn-load-probe.yml`, not reachable from any sandboxed local test. |

## Static baked reference data (not live-fetched)

| Module | Notes |
|---|---|
| `src/data/parkFactors.js` | Handful of real, individually-sourced MLB park factors — not the full real table (unreadable at the time, per the file's own header). |
| `src/data/umpireWatch.js` | 4 real umpires with confirmed rate/weakness out of 48 real names listed — the other 44 intentionally left blank, not backfilled. |

---

## Known gaps this doc exists to prevent repeating

- `window.storage`'s "shared" mode does **not exist** — checked against the Artifact runtime's authoritative capability list (only `downloads` and `mcp` are declared for this session) and this project's own institutional codex (zero hits). Anything proposing to build on it needs a real backend first.
- BSD's list/search endpoints are broken; only direct event-ID lookup is reliable. Don't re-discover this a third time.
- football-data.org has only ever been asked about La Liga. The other five major competitions are a real, unqueried surface.
- FPL's player-level fields are fetched today and thrown away after one lookup. That's real, sitting data, not a new integration.
