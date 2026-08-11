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

## `2026-08-11` — `drama_arc` stores the STRING `"null"` on 84 rows

**Status:** measured, not patched. Small, and the kind of thing that silently breaks a query.

Sweeping `/context/date/` over 45 days, 948 games (`outbox/drama-arc-shapes-*.txt`):

```
array           661   69.7%    a real JSON array of numbers
SQL null        203   21.4%    no drama recorded
string "null"    84    8.9%    the four-character string, NOT null
object            0    0.0%
```

All 84 carry `drama_peak: 0`, and they cluster in **EFL Cup (34), golf (30), PGA Tour (10),
MLB (7), CFL (3)** — the sports `anomalyBaseline.js` already records as never computing drama at
all. So the value means "no drama here"; it is just spelled as a stringified null instead of SQL
NULL.

**Why it is worth fixing rather than tolerating.** Absent is now spelled two ways, so
`WHERE drama_arc IS NULL` returns 203 rows and silently misses 84 more that mean the same thing —
a 29% undercount of "no drama recorded", with no error anywhere. Any future backfill, audit or
recompute keyed on that predicate inherits the gap.

The client side is already correct and now asserted: `parseDramaArc` returns null for both
spellings, verified in `scripts/check-drama-sparkline.mjs` against the measured census.

### CORRECTION — the object shape DOES exist, and the write path stopped

A 120-day sweep (1484 games) found **7 object-shape arcs**, all NBA. The earlier "zero objects"
figure came from a 45-day window starting 2026-06-27, and every object row predates it:

```
month        array   null   object   string "null"
2026-04         19     60        0        0
2026-05        159     55        6        0
2026-06        225     16        1       40
2026-07        497     86        0       37
2026-08        122    117        0       44
```

**The finding is not that the path never fired — it is that it stopped.** Rows landed in May and
June, then zero in July and August against 497 and 122 array rows. Since the 2026-08-03 reset
matched `drama_arc LIKE '[%'` (array only), these 7 survived it, which is exactly what makes the
sweep equivalent to `SELECT COUNT(*) WHERE drama_arc LIKE '{%'`.

**Its real shape, which diverges from its own documentation.** The Drive storage-layer doc
specifies samples as `[{t, s, p}]`. Across 37 real sample records there is **no `t` field**:

```json
{ "peak": 52, "peakPeriod": 1, "peakMinute": null, "sustainedMinutes": 0,
  "trend": "steady", "classification": "sleeper",
  "samples": [{ "s": 52, "p": 1 }, { "s": 44, "p": 0 }, ...] }
```

`peakMinute` is null on all 7. The playground now reads `samples[].s` and renders it on the same
fixed 0-100 domain, asserted in `check-drama-sparkline.mjs` against this verbatim record.

**The open question this leaves for the relay:** why did client-written drama stop after June?
That is now a sharper question than the one I started with, and it is the one worth a D1 query —
`SELECT MAX(created_at) ... WHERE drama_arc LIKE '{%'` would date the last write precisely.

### Drive context, checked 2026-08-11 — why the object shape is rare

Two primary docs explain the absence better than my measurement alone could.

**`CC Outbox — Retroactive Drama Backfill` (2026-07-02)** is the object shape's write path. It
produces exactly the documented fields — the run it reports ends with *"peak 57 at the equalizer,
escalating trend, 'sleeper' classification"*. Three things about how it fires:

- It runs **client-side, on app open**, via `runDramaBackfillDiscovery()` against
  `/archive/drama-missing?limit=3`.
- It is capped at **3 POSTs per app session**, `?limit=3` plus a client-side `.slice(0, 3)`,
  locked by smoke assertion `DRAMA-BACKFILL-003`.
- Its own Done Conditions record that it was **never verified to actually fire or land**:
  *"the app itself hasn't been run in a real browser this session — confirming
  `runDramaBackfillDiscovery()` actually fires on real app open, and that POSTed `drama_peak`
  values actually land in D1 correctly, requires a real browser session or a live deploy, neither
  available from this sandbox."*

A path writing at most 3 rows per human app-open explains the rarity precisely: **7 rows in four
months.** It also explains the July/August silence less well — the cap limits volume, it does not
stop writes entirely, so something else changed after June. The July verification gap is therefore
still open, and now has a date attached to it.

**A second detail worth carrying:** `dramaScoreLive` returns 0 for both `state==='pre'` and
`state==='post'`. Drama exists only for live states, which is consistent with the 84
stringified-null rows all carrying `drama_peak: 0` on sports whose live states are never fetched.

### And a display constraint the playground deliberately breaks

**`CC Outbox — Lock In Drama Score Display Compliance` (2026-07-01)** records that production
**never displays a raw drama score**. All 8 `dramaScoreLive(` call sites in `index.html` convert
through `dramaTier()` first, which returns only `'fire' | 'hot' | 'warm' | ''`, and two smoke
assertions plus `A495` guard it.

That matters for anything porting this sparkline back. The fixed 0-100 domain shipped here makes
**bar height literally readable as the drama value**, which is the opposite of tier bucketing, and
the Sparkline Spec's patent note calls the chart safe partly because it *"shows trajectory, not a
point value"*. The spec does permit real numbers **post-game (Amnesty Zone)**.

None of this binds field-playground — ADR-002 explicitly does not, and the 0-100 presentation is a
standing project rule here. It is recorded so that a port is a decision someone makes knowingly,
rather than a compliance regression someone discovers.

**Also settled here: the documented object shape is not observable.**
`CC-CMD-2026-08-03-fix-drama-backfill-situational-fields` describes every client write path as
producing `{peak, peakPeriod, sustainedMinutes, trend, classification, samples}`. Zero were found
in 948 games. That is consistent with the 537 buggy MLB rows being reset to null on 2026-08-03 and
drama not having been recomputed since — the shape may be real and simply unproduced right now —
but no extractor has been written for it, because a shape that cannot be produced on demand cannot
be built against.

---

## STATUS, 2026-08-11 — all three are DONE upstream. Corrected by the relay session.

An earlier revision of this section said the three CC-CMDs were staged and **"None yet picked up,"**
quoting the status line of `cc-cmd-2026-08-08-desk-sports-followups`. **That was stale and the
quotation made it look current.** All three were picked up, each with its own Aug 8 investigation
outbox:

| Item | Investigation |
|---|---|
| CFL archive path | `cc-session-2026-08-08-cfl-ar…` |
| id convergence / duplicate fixtures | `cc-session-2026-08-08-confir…` |
| MLB/WNBA archive gap | `cc-session-2026-08-08-invest…` |

**The error worth keeping, because it is a class and not a slip.** A codex status field is a
statement about the moment it was written. I read `"None yet picked up"` as a fact about now, and
built a plan on it — the same stale-premise failure `scripts/check-freshness.mjs` was built for,
applied diligently to git refs and not at all to the codex. Freshness is a property of *every*
retrieved claim, not just the ones with a commit SHA attached.

**What this directory's job actually is for these three:** nothing. They are finished upstream. What
follows is kept only as the record of what was measured here and where that measurement was wrong.

### CFL — landed upstream, with a caveat worth carrying

The CFL fix has landed. The relay session records that it did so **only after a failed first attempt
that inserted two rows instead of filling two**, which were then deleted. Net state is correct; the
path there was not clean. Worth knowing before anyone reads the row counts as evidence the write
path is well-behaved on first contact.

The field mapping below was derived here from the measured shape. It is retained as the record of
what `/cfl/scoreboard/rounds` actually contains — the `0`-for-unplayed gate in particular is a
property of the source, not of any one implementation, and stays true regardless of who wrote the
collection path.

### What this session can and cannot do

`src/index.js` is **not readable from here** — `read_lines` returns an empty body at every range,
for every offset. `scripts/` and `docs/` in field-relay-nba read fine; the main source does not.
The line citations elsewhere in this file (`10629`, `11162`) came from a session that had that
access and should be treated as unverified-from-here.

That has a hard consequence, stated rather than worked around: **a real patch against a real commit
cannot be produced from this session for anything touching `src/index.js`.** That includes the CFL
collection path and the duplicate-id convergence. What can be produced is measurement, and that is
what follows.

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

### The field mapping, derived from the measurement

This is the deliverable `cc-cmd-2026-08-08-cfl-archive-collection` was blocked on: its first step
was "record the real shape," and that is now done. Every row below is measured, not assumed.

| `/archive/game` field | From `/cfl/scoreboard/rounds` | Confidence |
|---|---|---|
| `date` | `tournaments[].date` (ISO, `+00:00`) — take the date part | measured, 93/93 |
| `start_time` | `tournaments[].date` in full | measured, 93/93 |
| `home` / `away` | `homeSquad.name` / `awaySquad.name` | measured, 93/93 |
| `home_score` / `away_score` | `homeSquad.score` / `awaySquad.score` | **only when `status === 'complete'`** |
| `sport` / `league` | constant `football` / `CFL` | n/a |
| `espn_event_id` | **none** — CFL has no usable ESPN feed at all | n/a |
| `venue` | **ABSENT AT EVERY DEPTH** | measured |

**The one hard gate.** `score` is non-null on 93/93, and 47 of those are unplayed fixtures carrying
`0`. Gate the write on `status === 'complete'` or `winner != null` — the two agree on all 93 rows.
A writer keyed on "is the score present" archives **47 phantom 0–0 finals**.

**`/cfl/scoreboard/squads` is not needed.** Team names are inline on the game record, so the
id→name lookup the spec anticipated is unnecessary. Squads carries standings (`wins`/`draw`/`loss`)
and a `TBD` row with `id: 0` — useful for other things, not for this.

**`venue` is a decision, not an oversight.** It comes from `echo.pims.cfl.ca` fixture detail or it
is written null. Whoever picks this up should choose deliberately, because `/archive/game` takes it
and a silent empty string is the kind of thing that reads as data later.

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

### RESOLVED — my hypothesis was refuted on 2026-08-08, and I mis-read how

**Final state:** the mechanism was **two bulk schedule imports either side of the id-scheme change**,
not the seed path. My "two writers, permanently disagreeing" hypothesis is **refuted**. The Aug 8
CC-CMD's own outbox states it plainly — *"The CC-CMD's hypothesis is REFUTED by the data"* — and the
Aug 9 cleanup script was built **from** that refutation.

**So the script never contradicted the finding; it implemented it.** I found the script first, read
its header as a rival account of the cause, and wrote this entry up as an open contradiction I could
not settle. It had already been settled, three days earlier, against me. Reading the investigation
outbox before the script would have shown that immediately — the fix is downstream of the
conclusion, so the conclusion is the thing to look for.

The original entry and my incorrect framing are preserved below, because a refuted hypothesis with
its refutation attached is more useful than a deleted one.

---

### (superseded) CORRECTION, 2026-08-11 — my hypothesis is contradicted by the relay's own account

Two things surfaced that the entry above did not know:

1. **A cleanup already ran.** `field-relay-nba/scripts/run-duplicate-row-cleanup.mjs` exists, from
   `CC-CMD-2026-08-09-cleanup-stale-duplicate-rows` — dated the day *after* this entry. It deletes
   stale name-scheme siblings from `postseason_games` under an `EXISTS`-guarded predicate.

2. **It describes a different cause than I did.** Its header says the duplicates were
   *"left behind by the two bulk schedule imports either side of the archive id-scheme change"* —
   a one-time migration artifact. That is the original disclosure's "self-heals" account, the one
   this entry doubted. My hypothesis was that the seed and resolution paths permanently disagree
   because the seed has no `series_key`.

**These cannot both be right, and I cannot settle it from here.** The discriminator is whether
duplicates are still being *created* on dates after the cleanup, and confirming the mechanism needs
`src/index.js`, which this session cannot read. `cc-cmd-2026-08-08-confirm-duplicate-fixture-mechanism`
already exists to answer exactly this and remains the right instrument.

**What is worth carrying forward:** the observation that duplicates appeared on four consecutive
current dates (08-05 through 08-08), not in a historical block, is the evidence that argues against
a pure migration artifact. It is not proof — a bulk import can cover future fixtures — but whoever
picks up that CC-CMD should test the created-vs-imported distinction rather than assume either
account. `scripts/probe-duplicate-created-at.mjs` in the relay repo appears built for precisely that.

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

### 2026-08-11 — the discriminator was attempted and does NOT work as written

`/archive/query?date=2026-08-05` returns **briefs, not games**: `count: 5`, every row a
`game_brief` / `slate` / `pre_game` record. It cannot answer "is there a games row," so the step
above is not runnable as specified and needs a different route (or a `/d1/execute` SELECT, which
requires the relay's `X-FIELD-Relay` credential this session does not hold and should not use).

**The inference I drew from it was WRONG.** I found a `pre_game` MLB brief on 2026-08-05:

```
pre_game_MLB_2026-08-04_diamondbacks_padres   sport: "mlb"   game_id: "401816398"
source: cron   created_at: 2026-08-04 10:01:24
```

…and concluded the cron "was running and producing MLB output for that date," which "kills the
simplest hypothesis."

**It does not, because briefs and game rows are written by different paths.** A brief existing tells
you nothing about whether the games were archived. I treated the presence of one artifact as
evidence about a different table without first checking they shared a writer — the same shape as
reading a fill rate as if it answered a question it cannot.

**The real finding, from the relay session that can read the source:** `/archive/backfill` calls
`executeBackfill`, whose first statement is

```sql
SELECT * FROM regular_season_games WHERE date = ?
```

It **consumes** archived games to generate a brief — it does not write them. It returned `ok: true`
twice, for 2026-08-05 and 08-06, **while writing nothing**. An `ok` from a consumer over an empty
source is not evidence of a healthy producer, and that is the whole gap.

Re-spec'd upstream as `docs/CC-CMD-2026-08-10-archive-gap-real-write-path.md`, aimed at
`POST /archive/game` — the actual write path — rather than at the backfill route I was reasoning
about.

**And a fifth id scheme.** That brief's `game_id` is a bare ESPN event id — no date, no sport,
matching none of the four schemes measured on 2026-08-08. It is recorded as a known-unparseable
fixture in `scripts/check-gameid-parse.mjs`: the parser returns nulls rather than inventing a date,
which is the safe failure, but anything joining briefs to games across these two id spaces should
know they do not share one.
