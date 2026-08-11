# CC Session Outbox — pick'em correctness pass, and measuring the CFL source

**Date:** 2026-08-11

---

## What was asked

"Probe `/cfl/scoreboard/rounds` and record its real shape," then a review of the pick'em subsystem
("detail pick 'em"), then "fix 1 and 3", "fix 2 and 4", "fix 5", then "go" on the pending relay
fixes.

---

## `/cfl/scoreboard/rounds` — measured in three runs, because two were not enough

**Staleness first, deliberately.** ESPN's CFL feed was disqualified for returning 2022 data while
looking perfectly healthy, so the probe establishes what year the data describes before profiling
a single field.

```
147 date-shaped strings.  All 2026.  Zero older years.
```

Root is a bare array of **27 rounds**; games nest under `rounds[].tournaments` — **93** of them, the
full PRE/REG/POST season in one 155 KB call. Not a `games` or `fixtures` key; the probe located the
array by structure rather than by guessing a name, which is the only reason it found it.

**The trap, and why runs 1 and 2 missed it:**

| Run | What it reported | What it missed |
|---|---|---|
| 1 | `homeSquad` is an `object`; a `score` key exists *somewhere* | the envelope measured, the payload closed |
| 2 | `homeSquad.score` non-null **93/93 (100%)** | a fill rate that reads as "always available" |
| 3 | cross-tab against `status` | **47 unplayed fixtures carry `0`, not `null`** |

```
status        n    0-0   null   points   winner-set
complete      46      0      0      46          46
scheduled     47     47      0       0           0
```

A writer gating on "is the score present" archives **47 phantom 0–0 finals** — a fully-populated
response that is wrong, which is ESPN's failure class wearing a different disguise. Gate on
`status === 'complete'` or `winner != null`; they agree on all 93 records.

**A fill rate answers "does this field exist", never "does it mean what its name says."** That is
the same lesson as the marginal-vs-conditional schema error five days ago, and I had written it into
`schema-from-measurement.mjs` without applying it here first.

Two of the spec's three open questions close: `game_status` is present in 2026 (with the nuance that
round-level status has a `playing` value game-level does not — it is a week-window state, not a live
signal). **Live polling stays open**: `activePeriod` was null on all 93 and no CFL game was live at
probe time.

---

## Pick'em — five findings, five fixes

Ordered by cost of being wrong, not by how interesting they were.

### 1. Draws were graded as away wins

```js
const winner = game.home_score > game.away_score ? 'home' : 'away'   // no tie branch
```

A 2–2 final evaluated `false` → `'away'`: every home pick marked **incorrect**, every away pick
**correct**, silently and with full confidence. Soccer is not excluded from the component (only
`NON_MATCHUP_SPORTS` is) and MLS ran 11–14 rows/day in the measured window, so this was firing on
real games. `record()` and the verdict string inherited it.

Now grades `push`, kept out of the decided total. **No sport list** — a draw is a level score at
final, and in sports that cannot draw the branch never fires. A hardcoded "these sports can draw"
table would be one more thing to keep true as leagues come and go.

**Known limit, stated:** a cup tie settled on penalties also finals level, and the relay carries no
penalty result yet, so it reports as a push. Wrong, but wrong in the direction of admitting
ignorance rather than crediting a coin flip.

### 2. The Brier score was not measuring calibration

Confidence was captured retroactively, on picks already marked W or L, **with the result rendered in
the same row as the slider**. A Brier score over that is not calibration — the forecast came after
the event, so 0.25 is not the right null and beating it is not evidence of skill. The component
asked "is your confidence actually predictive" and displayed a figure that could not answer it.

The retrospective ratings are not deleted; they record something real, just not forecasting.
`outcomes.js` now classifies each rating at write time, and the two populations are scored
separately and never summed. A mode is fixed at first write and **cannot be promoted** — re-rating a
resolved game cannot turn hindsight into a forecast. Legacy entries read as hindsight: all were
captured through a UI showing the result, so unknown is evidence of hindsight, not its absence.

### 3. Three of four real id schemes were silently dropped

Both call sites required the id to *start* with a date — true of the drama leaderboard's scheme,
false of all three archive schemes.

```
2026-05-25-mlb-baltim-tampa                           MATCH   2026-05-25
MLS_2026-08-06_newyorkcityfootballclub_clubsantoslag  DROP    null
MLS_MLS-COM-000006_MLS-MAT-000A3C_phaseone_2026-08-0  DROP    null
FIFA World Cup 2026_2026-08-06_teamone_teamtwo        DROP    null
```

The failure was a `continue`: outcomes vanished from the streak and from "this week," and
`setOutcome` stored `date: null`. Shared parser now in `src/data/gameId.js`. A **fifth** scheme
turned up later — a bare ESPN event id on briefs — and is asserted as known-unparseable.

### 4. I was wrong about this one, and the probe said so

I suspected the strict `home_score === null` was a live defect: an absent key would fall through to
`'live'` and disable picking. **It is not.** A CI probe ran the shipped function over 150 real games
across 7 days:

```
key absent entirely:  0        misclassified unstarted games: 0
key present, null:   17        final 126 · pre 17 · final_ot 7
numeric score:      133
```

So this is hardening, and calling it a bug fix would have claimed credit for a bug that was not
happening. What *is* real, and the same probe proved it:
`gameStatus({home_score: 0, away_score: 0, finalized_at: null})` returns `"live"` — and CFL writes 0
on all 47 unplayed fixtures. `start_time` closes it where the relay supplies one (16.7% fill for
MLS, so partial by construction), failing toward `'live'`: a blocked pick is harmless, a retroactive
one is not.

### 5. My framing was wrong, and acting on it would have broken two components

I described `outcomes()` as a hand-marked version of what PickEm derives. It is not — it is the
**editorial** ledger (FIELD's ambient picks, tiered, marked in AmbientPanel), and Agreement and
CrossCheck read it as exactly that, comparing it against `picks`. Merging would have made them
compare a pick against its own result: **a tautology reporting perfect agreement, with no error
anywhere.**

The real defect underneath was narrower and still real: your own picks had no persistent verdict.
PickEm grades from `deskStore`, which holds only the current date, so a pick from any earlier day
was unscorable. `myResults` is therefore a second ledger, not a merge.

It also repairs #2: Calibration's forward path resolved against `outcomes()`, so a forward rating
could only complete if that game *also* happened to be a hand-marked editorial pick. The forward
set — the only set that is really calibration — was close to unfillable by construction.

**Driving the app caught a flaw no unit test would have.** The recording effect was written inside
`PickEm()`, which mounts only while the Picks tab is open, so a game finalling while the reader sat
elsewhere had its verdict derived, rendered, and discarded. Moved to module scope; the same run then
recorded `"L"` without Picks ever being opened.

---

## Verification posture

Four new guards, all wired into `build-check`, and **every one was confirmed to fail against the
pre-fix code.** A guard that passes on both versions proves nothing.

| Guard | Proven to fail on |
|---|---|
| `check-pick-grading.mjs` | the missing tie branch (`home→incorrect, away→correct` on 2–2) |
| `check-gameid-parse.mjs` | the leading-date-anchored regex (3 of 4 schemes null) |
| `check-confidence-mode.mjs` | — (new invariant, no prior version) |
| `check-ledger-separation.mjs` | the ledger merge I nearly shipped |

Two of these cannot be verified by driving the app at all — one needs a real draw on the slate, the
other needs an archive-keyed outcome nobody has in localStorage — which is why they are fixtures
built from measured ids rather than browser checks.

---

## The relay fixes — three claims here were wrong, corrected by the relay session

**All three items are DONE upstream.** This section originally reported them as staged-but-unpicked
and offered measurement toward them. A parallel session with real relay access corrected it, and the
corrections matter more than the original content, so they go first.

### 1. "None yet picked up" was stale, and quoting it made it look current

I read that status line out of `cc-cmd-2026-08-08-desk-sports-followups` and treated it as a fact
about now. It was true on Aug 8. All three had been picked up by the time I quoted it, each with its
own investigation outbox.

**A codex status field is a statement about the moment it was written.** `check-freshness.mjs` was
built in this repo for exactly this failure, and I applied it rigorously to git refs while treating
a retrieved status line as timeless. Freshness is a property of every retrieved claim, not only the
ones carrying a commit SHA.

### 2. The duplicate-fixture question was not open — it was settled against me

My hypothesis (seed and resolution paths permanently disagree because the seed lacks a `series_key`)
is **refuted**. The real mechanism was two bulk schedule imports either side of the id-scheme
change. The Aug 8 outbox says so directly, and the Aug 9 cleanup script I found was built **from**
that refutation.

I read that script's header as a *rival account* and wrote the entry up as an unresolved
contradiction. It was the downstream consequence of a conclusion already reached. **The fix is
downstream of the finding, so the finding is what to look for** — reading the investigation before
the remediation would have shown it at once.

### 3. My MLB inference was wrong, and this is the one that would have misled someone

I found a `pre_game` MLB brief from cron on 2026-08-05 and concluded the cron "was running and
producing MLB output," which "kills the simplest hypothesis."

**Briefs and game rows are written by different paths.** A brief existing tells you nothing about
whether the games were archived. I used the presence of one artifact as evidence about a different
table without checking they shared a writer — structurally the same error as reading a fill rate as
though it answered a question it cannot.

The real finding: `/archive/backfill` calls `executeBackfill`, whose first statement is
`SELECT * FROM regular_season_games WHERE date = ?`. It **consumes** archived games to make a brief;
it does not write them. It returned `ok: true` twice while writing nothing. An `ok` from a consumer
over an empty source is not evidence of a healthy producer. Re-spec'd upstream as
`CC-CMD-2026-08-10-archive-gap-real-write-path.md` against `POST /archive/game`.

### What stands

The CFL measurement. The shape of `/cfl/scoreboard/rounds` is a property of the source: 27 rounds,
93 games under `rounds[].tournaments`, team names inline, `venue` absent at every depth, and the
`0`-for-unplayed gate on 47 fixtures. That remains true regardless of who wrote the collection path.
The CFL fix landed upstream — after a failed first attempt that inserted two rows instead of filling
two, since corrected.

`src/index.js` being unreadable is a property of **this session**, not the file; the relay session
reads it normally. My phrasing ("not readable from here") was accurate and worth keeping precise.

### (original framing, superseded)

A `codex_search` found `cc-cmd-2026-08-08-desk-sports-followups`: all three items already have
self-contained CC-CMDs **staged in field-relay-nba**, "None yet picked up." Restating them would be
duplicate work — the case Rule 91's Collision Check exists to catch.

**Hard boundary:** `src/index.js` is not readable from this session (`read_lines` returns an empty
body at every range; `scripts/` and `docs/` read fine). So no real patch against a real commit can
be produced here for the CFL collection path or the id-scheme convergence.

What was supplied instead:

- **CFL field mapping**, derived from the measurement — the thing that CC-CMD's first step was
  waiting on. Team names are inline, so the anticipated squads id→name lookup is unnecessary.
  `venue` is absent at every depth: a decision, not an oversight.
- **Duplicate fixtures — my hypothesis is contradicted.** `run-duplicate-row-cleanup.mjs`
  (CC-CMD-2026-08-09) attributes the rows to two bulk imports either side of the id-scheme change —
  the "self-heals" account I doubted. Both cannot be right; recorded as unresolved rather than
  quietly picking mine.
- **MLB/WNBA gap — the cheapest discriminator does not work as written.** `/archive/query` returns
  briefs, not games. But it showed a `pre_game` MLB brief on 2026-08-05 from cron, so the cron was
  running and producing MLB output for the missing date. That kills the simplest hypothesis.

---

## Confidence gate

**REVISED DOWN to 79/100** after the relay session corrected three claims in the section above.

The original 88 was scored on the pick'em work, where it still roughly holds — those fixes are
measured, guarded, and each guard was proven to fail on the broken version. The revision is entirely
in the relay section, and the deduction is not "three facts were wrong" but **the gate did not
catch them**: it listed six things I could not verify, and every one was a *known* unknown. All three
errors were in claims I stated flatly, with no hedge, because I did not notice they were inferences.

- **Two were retrieval-freshness failures** — a quoted status line and a script header read as
  current fact. The gate has no line for "how old is the evidence behind each claim."
- **One was an inference presented as an observation** — the MLB brief. Nothing in the gate
  distinguished "I measured this" from "I concluded this from something I measured."

**The rule that follows:** a confidence gate that only enumerates acknowledged gaps measures
humility, not accuracy. The claims that need marking are the ones stated without hedging, because
those are where an error travels furthest before anyone checks it.

---

### Original gate, as written before the corrections

**88/100.**

Every behavioural claim is either measured against real data or asserted by a guard proven to fail
on the broken version. Three of the five fixes corrected something that was actively producing wrong
output; one was correctly downgraded to hardening by measurement; one had its framing corrected
before it broke two components.

**The 12-point deduction, specifically:**

- **No real draw was ever observed.** The draw fix is verified by fixture only. MLS draws are common
  in principle, but nothing in this session graded an actual one end to end, and the slate on the
  day was MLB-heavy.
- **The browser verification ran against Vite's mock relay, not production.** In DEV `RELAY_BASE` is
  `''` and `mockRelay` serves the data, so the `myResults` end-to-end run exercised mock shapes. The
  shapes are captured from real probes, but this is not the same as verifying against the live
  relay, and I did not close that gap.
- **The forward-calibration cycle has never completed.** I verified capture, the empty state, the
  write path, and the resolution logic separately. No single forward rating has yet gone
  rate → game finals → Brier score. The parts are each tested; the loop is not.
- **The CFL mapping's left column is unverified from this session.** The `/archive/game` field list
  is quoted from an earlier doc, and `src/index.js` is unreadable here, so the mapping is measured
  on the source side only. Whoever applies it should confirm the payload contract independently.
- **`parseGameId` takes the first date when an id contains two.** No measured id does, so this rule
  is untested against a real case and is an assumption about ids that do not exist yet.
- **The duplicate-fixture contradiction is left open,** and I have no way to settle it here. The
  entry now carries both accounts rather than a resolution, which is honest but not finished.
- **CFL live polling remains unexercised.** Two of three spec questions closed; this one cannot
  close without a live game, and the weekly cron may or may not land during one.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/gameId.js` | new — shared id parser |
| `src/data/outcomes.js` | confidence mode + `myResults` ledger |
| `src/components/PickEm/index.jsx` | draw grading, `gameStatus` hardening, module-scope recording |
| `src/components/Calibration/index.jsx` | forward/hindsight split, per-population truth source |
| `src/components/PickStreak/index.jsx` | shared parser; narration corrected to "editorial" |
| `scripts/probe-cfl-scoreboard-shape.mjs` | new — 3 runs, weekly cron |
| `scripts/probe-gamestatus-over-real-slate.mjs` | new — falsified the #4 hypothesis |
| `scripts/check-gameid-parse.mjs`, `check-pick-grading.mjs`, `check-confidence-mode.mjs`, `check-ledger-separation.mjs` | new guards, all in `build-check` |
| `docs/pending-relay-fixes/README.md` | collision finding, CFL mapping, two corrections |
| `outbox/cfl-scoreboard-shape-*.txt`, `gamestatus-over-real-slate-*.txt` | real results |
