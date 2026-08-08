# Pending relay fixes

Changes to the relay that are **diagnosed, written, and verified here** but not yet applied.

FIELD is one system across three repos — the client (`jubilant-bassoon`), the relay
(`field-relay-nba`), and this one. A relay defect found while working here is a FIELD defect, and this
directory is where the fix lives until someone deploys it. It is a staging area within the project, not
a stash of foreign material: the diagnosis, the measurement, the probe that found it and the standing
regression detector are all here too.

**This directory is the boundary, and it is deliberate.** field-playground is permanently separate from
production — it never becomes a second production surface, and nothing in it ships. So a relay fix
staged here is *finished work that has not crossed into production*, and crossing that line is a
separate, human act in the relay's own repo under its own discipline. A patch sitting here is the
system working as designed, not a loose end.

What holds a patch here rather than in the relay is therefore not ownership. It is that a push to
`field-relay-nba/src/**` auto-deploys to production, so applying one is a decision with a timing
component. Session repo scope can additionally mean a given session cannot push there; that is a
property of the session, not of where the work belongs.

Each entry is a real patch against a real commit, not a sketch.

---

## `2026-08-06-soccer-league-label.patch`

**Fixes:** every soccer league being archived as the World Cup. Measured at **52 of 60** checkable
archived rows (86.7%), all really MLS, stored as `sport = "FIFA World Cup"` with ids prefixed
`FIFA World Cup 2026_`.

**Against:** `field-relay-nba` @ `7de2729`.

**The change**, at three archive write sites (catch-up ~7084, pre-game seed ~7170, yesterday-finals
~7254):

```diff
-sport: gm.sport === 'soccer' ? 'FIFA World Cup 2026' : gm.league,
+sport: gm.league,
```

`gm.sport` is ESPN's top-level sport — the literal `'soccer'` — not the competition, so the ternary
relabelled all six non-WC soccer leagues. `gm.league` already holds the correct label from the `LEAGUES`
table twelve lines above (`league: label` in `gameMeta.push()`). The non-soccer branch already used it.

The nine-line comment each site carried, explaining why the literal must not change, was correct **for
WC26 in July 2026** and predates MLS sharing the branch. The patch replaces it with a note recording
both the original reasoning and why it no longer holds.

### To apply

```bash
cd field-relay-nba
git apply /path/to/2026-08-06-soccer-league-label.patch
node --check src/index.js          # passes as prepared
git diff                            # 3 sites, sport: gm.league
```

### Before pushing — the one real hazard

Changing the label changes the id prefix, because `/archive/game` builds ``id = `${sport}_${date}_...` ``.

- **Already-archived rows are safe.** All three writers dedup on `espn_event_id`, not on id.
- **WC26 rows keep their `sport` column** — `canonicalizeWC26Sport()` maps `'FIFA World Cup'` to the
  same canonical value. Only their id prefix changes.
- **The exposure is one specific case:** a game *seeded pre-game under the old id and finalized after
  the deploy*. Catch-up's guard is `existing && existing.home_score !== null`, so a seeded row with a
  null score does not short-circuit — the write goes out under the new id, misses `ON CONFLICT`, and
  **inserts a second row** instead of updating the seed.

**Mitigation is scheduling, not code.** Deploy between slates, when no soccer game is
seeded-but-unfinal. Confirm with `/context/date/{today}` — no soccer row with a null `home_score` and a
kickoff already passed.

### Companion data correction

The patch stops new bad rows; it does not fix existing ones. The migration for those is generated from
a real measured run, not hand-written — see the newest `outbox/soccer-league-mislabel-scope-*.sql`.

It corrects the **`sport` column only**. `game_id` is deliberately left alone: `briefs.game_id` joins
`games.id` in `analytics-engine.js` at lines 999, 1005, 1411 and 1417, so rewriting the id prefix would
silently drop those joins for any brief already referencing these rows — no error, just briefs that stop
matching their game. The prefix is legacy cosmetics; the column is what drives per-sport bucketing,
`soccerLeagueSlug()`, the analytics config key, and display.

The migration is scoped by `espn_event_id`, which every affected row carries, so it targets exactly the
measured rows — no `LIKE` on the label, nothing that could sweep in a genuine World Cup fixture. It is a
label correction, **not** a `drama_peak` write, so the immutability guard is not involved.

### To verify afterwards

Re-run the scope probe (`soccer-league-mislabel-scope-probe.yml`, or `workflow_dispatch`). Mismatched
rows should drop to zero for the corrected set, and stay at zero for newly-archived games. It runs
weekly on its own as the standing regression detector.

---

## `2026-08-08` — CFL is never archived

**Status:** cause confirmed, **and the obvious fix is actively harmful — do not apply it.**

**Symptom:** no CFL anywhere in the playground, on any date.

**Cause:** CFL is absent from the `LEAGUES` list the archive writer polls, so CFL games never enter
`/context/date/`, which is the only thing the desk reads.

### The one-line fix I first staged here was WRONG

The obvious change is to add a row to `LEAGUES`:

```js
{sport:'football',  league:'cfl',  label:'CFL'},   // DO NOT
```

`LEAGUES` drives an **ESPN** scoreboard fetch. Per *FIELD — CFL Data Source Spec v2* (Drive, 2026-06-26,
relay commit `c23c4a50d9`):

> **ESPN CFL RETURNS 2022 STALE DATA.** Live probe returned Season: 2022, Week: 3. Do not use for live
> scoring.
> `ESPN football/cfl   Scoreboard   ❌ returns 2022 data`

So that line would return HTTP 200 with a **fully populated** `events[]` of four-year-old games and
archive them as current. Worse than not working, and worse than my own staged caveat anticipated — I
wrote that an empty `events[]` would reveal a bad slug. The real failure mode is a *full* one.

**The general lesson, third time it has bitten today:** check for an existing spec before proposing a
fix. The RUWT reading was corrected the same way, and so was the `above-typical` design.

### What the sources actually are

| Source | Data | Status |
|---|---|---|
| `api.cfl.ca` | everything | ❌ dead since 2023, DNS failure |
| ESPN `football/cfl` | scoreboard | ❌ returns 2022 data |
| `echo.pims.cfl.ca` | teams, rosters, player + team stats, fixture detail | ✅ live, relay `/cfl/*` |
| `cflscoreboard.cfl.ca` | **live scoreboard** | ✅ live, relay `/cfl/scoreboard/rounds` |
| The Odds API | pre-game WP | ✅ live, `/cfl/odds-probs` |

The relay already proxies all of these. **Nothing needs building upstream — only the archive write path
is missing.**

### The actual shape of the work

Not a `LEAGUES` entry. `LEAGUES` is ESPN-shaped
(`/espn-gambit/apis/site/v2/sports/{sport}/{league}/scoreboard`) and CFL has no usable ESPN feed. CFL
needs its **own** collection path in the archive writer, reading `/cfl/scoreboard/rounds`
(`src/index.js:11162`, already cache-guarded at 30s per `CC-CMD-2026-07-05-cfl-scoreboard-cache-guard.md`)
and mapping rounds → the `/archive/game` payload.

Three things the spec flags that will shape it:

- **Live score polling is untested.** `game_status` is confirmed present in 2025 fixtures, *"verify
  presence in 2026"*, and has never been exercised during a live 2026 game.
- **Season IDs are split.** Stats use `season_id=35` for 2026; fixtures use `75`. Using 35 for fixtures
  returns zero results.
- **`/cfl/fixtures` is not a schedule.** It returns 15 playoff shells with `home_team_id=null`. Fixture
  IDs come from the `fixtures[]` sub-array inside `/cfl/stats/teams`.

### The route has now been measured — `outbox/cfl-scoreboard-shape-2026-08-08T22-17-32-772Z.txt`

Three CI runs, because the first two each stopped one level short of the answer. **The source is
usable**, and the staleness test it was built around comes back clean:

> 147 date-shaped strings in the payload. **All 2026. Zero older years.** `cflscoreboard.cfl.ca` does
> not exhibit the ESPN failure mode.

**Real shape:** the root is a bare array of **27 rounds**; games nest under `rounds[].tournaments`
(**93** of them, the full PRE/REG/POST season in one 155 KB call). Not a `games` or `fixtures` key —
found by locating the array structurally rather than guessing its name.

```jsonc
{ "id": 13419665, "date": "2026-05-18T19:00:00+00:00", "status": "complete",
  "homeSquad": { "id": 112939, "name": "Calgary Stampeders",       "shortName": "CGY", "score": 20 },
  "awaySquad": { "id": 106752, "name": "Saskatchewan Roughriders", "shortName": "SSK", "score": 15 },
  "winner": 112939, "activePeriod": null, "clock": null, "possession": "None",
  "timeouts": {"away": 2, "home": 2}, "markets": {...}, "cflId": 6582, "isHidden": false }
```

**Against `/archive/game`:** `date`, `home`, `away`, `home_score`, `away_score` and `start_time` are all
directly available — team **names** included, so `/cfl/scoreboard/squads` is *not* needed as a
id→name lookup. `venue` is the one gap, and it is a real one: a search of every key at every depth
found **no venue-like key anywhere**. It comes from a second source or is written null — a decision to
make deliberately, not an oversight to discover later.

### The trap this route sets, measured

`homeSquad.score` is non-null on **93/93 (100%)**. That number is a lie of the useful kind:

```
status        n    0-0   null   points   winner-set
complete      46      0      0      46          46
scheduled     47     47      0       0           0
```

**Unplayed fixtures carry `0`, never `null`.** A writer that gates on "is the score present" archives
**47 phantom 0–0 finals** — a fully-populated response that is wrong, which is exactly the ESPN failure
class in a different disguise. Gate on `status === 'complete'` or on `winner != null`; the two agree on
all 93 records, so either works and neither is a guess.

This is also why the first two probe runs were not enough. Run 1 reported `homeSquad` as `"object"` and
separately noted a `score` key existed *somewhere* — the envelope measured, the payload closed. Run 2
opened it and produced the 100% fill rate. Only run 3 cross-tabbed against `status`. **A fill rate
answers "does this field exist", never "does it mean what its name says."**

### The spec's open questions, now closed (two of three)

- **`game_status` in 2026 — YES.** `status` is present on 100% of both rounds and games. One nuance
  worth carrying: round-level status has three values (`complete｜playing｜scheduled`) and game-level
  only two. A round reads `playing` while none of its games are, so it is a *week-window* state, not a
  live signal.
- **Live polling — STILL UNTESTED, and now known to be so.** `activePeriod` was null on all 93 records
  and `clock` on 93/93 across two of three runs (one run caught a single `"00:00"`). No CFL game was
  live at probe time, so the live path remains unexercised — the spec's caveat stands, and this probe
  cannot retire it. Re-run during a live game to settle it.
- **Season-ID split / `/cfl/fixtures` shells — not applicable here.** Those are `echo.pims.cfl.ca`
  concerns. This route takes no season parameter and returns real games, not shells.

The probe is committed as `scripts/probe-cfl-scoreboard-shape.mjs` with a weekly workflow, so the
staleness check keeps running rather than being a one-time reassurance.

## `2026-08-08` — every seeded fixture is archived twice

**Status:** diagnosed, **no patch — and a documented assumption looks wrong**.

**Symptom, measured over 14 real days:** 18 duplicate rows across 5 dates. On 2026-08-06 the desk showed
**11 rows for 6 real matches**. Each pair is the same fixture under two different ids — one unscored, one
final:

```
MLS_2026-08-06_newyorkcityfootballclub_clubsantoslaguna
   score=—     finalized=no
MLS_MLS-COM-000006_MLS-MAT-000A3C_phaseone_2026-08-06
   score=0-2   finalized=yes
```

**Cause,** at `src/index.js:10629`:

```js
const id = series_key
    ? `${sport}_${series_key}_${shortify(round) || 'r'}_${date}`
    : `${sport}_${date}_${idTail}`;
```

Two ids for one match means `ON CONFLICT` cannot merge them. They are distinct rows by construction.

**The part worth a second look.** The comment above that line already discloses duplication, but frames it
as transitional:

> *"any CURRENTLY-PENDING placeholder leg will still duplicate exactly once on its next resolution (old id
> → new id, unavoidable without that riskier rename), **then self-heals** — every subsequent write to that
> same series_key+round+date correctly upserts via the new id from then on."*

**The measured data does not look like a one-time migration.** Duplicates appear on 2026-08-05, 06, 07 and
08 — current dates, not a backlog. The likely reason self-healing never happens: the **pre-game seed**
writes from `gameMeta` (built from the ESPN scoreboard), which carries **no `series_key`**, so it always
takes the `SPORT_date_teams` branch. The **resolution** writes with a `series_key`, so it always takes the
other. Two writers, two different id inputs, permanently. Every fixture that gets both a seed and a
resolution duplicates once — and always will.

That is a hypothesis consistent with every observed pair (old-scheme row unscored, new-scheme row final),
not a proven mechanism. **Confirm before acting:** check whether the pre-game seed path can obtain a
`series_key` at seed time. If it cannot, the disclosure's "self-heals" is wrong and this is structural.

**Why no patch is attached.** The two candidate fixes are not equivalent in risk:
- *Converge the id schemes* — rewrites historical ids that `briefs.game_id` already joins against in
  `analytics-engine.js` (999, 1005, 1411, 1417). Same hazard that made the MLS label fix `sport`-column-only.
- *Dedupe at read time* — `espn_event_id` is **null on every duplicate pair measured**, so the obvious
  join key is unavailable. It would have to key on `(sport, date, home, away)`.

Both need a decision this session should not make alone.

---

## `2026-08-08` — MLB and WNBA missing from the archive for two whole days

**Status:** open investigation, **not a patch**.

**Symptom:** `/context/date/` returns MLB on essentially every date in a 14-day window — and **zero** on
2026-08-05 and 2026-08-06.

```
2026-08-07   35   MLB:15  MLS:14  WNBA:3  EFL Cup:3
2026-08-06   11   MLS:11                              <- no MLB, no WNBA
2026-08-05   12   MLS:12                              <- no MLB, no WNBA
2026-08-04   20   MLB:15  MLS:4  WNBA:1
```

MLB posts a steady 15 rows/day either side of the gap. The playground was cleared as the cause: the
deployed site renders every sport the relay serves on every other date, verified in a real browser
(`probe-deployed-desk-sports.mjs`).

**Not root-caused, and no fix should be written until it is.** Candidates worth separating: the archive
cron not running on those dates; the ESPN fetch failing for the baseball/basketball slugs specifically;
or rows written under a sport label that `/context/date/` does not return. The last is not idle — this
repo has already found MLS fixtures stored as `FIFA World Cup`.

**Cheapest discriminator:** query the archive directly for those two dates without the `/context/date/`
filter. If rows exist, it's a read/label problem. If they don't, it's a write problem, and the cron logs
for 2026-08-05/06 say which.
