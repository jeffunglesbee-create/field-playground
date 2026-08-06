# CC Session Outbox — MLS rows: root cause found, fix prepared, one decision left

**Date:** 2026-08-06

---

## What was asked

"Fix MLS game rows" — following the incidental finding that archived MLS fixtures carry
`sport = "FIFA World Cup"` and ids prefixed `FIFA World Cup 2026_`.

Root cause is found and measured, the code fix is written and syntax-checked, and the data fix is
designed. **Neither is applied**, for one reason stated plainly at the end.

---

## Root cause: one expression, three sites

`field-relay-nba/src/index.js`, at the catch-up (~7084), pre-game seed (~7170) and yesterday-finals
(~7254) archive writers:

```js
sport: gm.sport === 'soccer' ? 'FIFA World Cup 2026' : gm.league,
```

`gm.sport` is **ESPN's top-level sport** — the literal string `'soccer'` — not the competition. So the
ternary relabels *every* soccer league as the World Cup.

The mistake is sharper than it looks, because the correct value was already sitting there. The `LEAGUES`
table twelve lines above carries proper labels, and `gameMeta.push()` stores them as `gm.league`:

```js
espnLeague: league,  // slug e.g. "fifa.world"
league: label,       // 'EPL' | 'MLS' | 'La Liga' | 'Serie A' | 'Bundesliga' | 'Ligue 1' | 'FIFA World Cup'
```

**The ternary overrides a correct value with a wrong one.** The non-soccer branch already does the right
thing (`gm.league`); only the soccer branch was special-cased, and the special case is wrong.

**So this was never MLS-specific.** All six non-WC soccer leagues route through the same branch. MLS is
simply the one with games on the board.

### Why the old comment was reasonable and still wrong

All three sites carried an identical nine-line note from `CC-CMD-2026-07-15-wc-label-fragmentation`
explaining why the literal must *not* change: it feeds `/archive/game`'s id construction
(``id = `${sport}_${date}_...` ``), and a live WC26 game was mid-flight under that exact id.

That reasoning was correct **for WC26 in July**. It predates MLS sharing the branch. A guard written for
one league silently became a bug for six — worth noting because the comment is exactly the kind of
artifact that stops the next reader from looking.

---

## Measured scope: 52 of 60, and a clean signature

`probe-soccer-league-mislabel-scope.mjs`, 30-day real window, true competition resolved **from ESPN by
event id** (`header.league.name`, resolved on 60/60 — never inferred from club names, since inference is
what caused the bug):

```
real soccer-ish archived rows:   179
  ...with an espn_event_id:       60
  ...without one:                119

archived `sport` as stored:   "MLS": 119     "FIFA World Cup": 60

resolved: 60   unresolved: 0
MISLABELED: 52 of 60  (86.7%)  -- every one of them really MLS
```

The split is the confirmation. **Rows with an `espn_event_id` are the mislabeled ones; rows without one
are labeled correctly.** `source_id: gm.eventId` is set by exactly these three writers — so the defect
tracks the code path with no exceptions, and a different, correct write path produced the other 119.

Only 8 of the 60 are genuinely the World Cup.

### This also corrects a number I reported earlier today

The hygiene probe's per-sport table listed `fifa world cup — 59 games, 7 distinct values`. That bucket is
**~87% MLS**. The distribution attributed to the World Cup was mostly Major League Soccer. Anything
downstream of that row needs re-deriving once labels are fixed — including the anomaly baseline, whose
entire premise is per-sport bucketing.

### Consequences beyond display

- **Per-sport bucketing** pools MLS into the WC bucket — the above.
- **`soccerLeagueSlug()`** in `drama-backfill.mjs` derives an ESPN slug *from this stored label*, so MLS
  rows resolve to `fifa.world`. Benign today only because ESPN's summary endpoint resolves by event id
  and ignores the path slug — a latent dependency on undocumented behavior, not a safe design.
- **`analytics-engine.js`** maps both `'FIFA World Cup'` and `'FIFA World Cup 2026'` onto the `WC26`
  config key, so MLS rows inherit WC26 configuration.
- **Users** see 52 real MLS fixtures labeled as the World Cup.

---

## The code fix (written, syntax-checked, not pushed)

Saved at `docs/pending-relay-fixes/2026-08-06-soccer-league-label.patch`. All three sites become:

```js
sport: gm.league,
```

`node --check src/index.js` passes; no occurrence of the ternary remains.

**Transition risk, stated honestly.** Changing the label changes the id prefix
(`FIFA World Cup 2026_` → `MLS_` / `FIFA World Cup_`).

- Already-archived rows are **safe** — all three writers dedup on `espn_event_id`, not on id.
- The real exposure is narrow and specific: a game **seeded pre-game under the old id and finalized
  after the deploy**. Catch-up's guard is `existing && existing.home_score !== null`, so a seeded row
  with a null score does *not* short-circuit; the write then goes out under the new id, misses
  `ON CONFLICT`, and inserts a **second row** instead of updating the first.
- Mitigation is scheduling, not code: deploy **between slates**, when no soccer game is seeded-but-unfinal.
- WC26 rows keep their `sport` column value either way — `canonicalizeWC26Sport()` maps
  `'FIFA World Cup'` to the same canonical label. Only their id prefix changes.

---

## The data fix: correct `sport`, do **not** rewrite `id`

The 52 rows need `sport = 'MLS'`. The instinct is to fix the ugly id prefix too. **That would break
things**, and this is the load-bearing finding of the whole investigation:

```sql
FROM briefs b JOIN regular_season_games g ON b.game_id = g.id     -- analytics-engine.js:999
FROM briefs b JOIN postseason_games  g ON b.game_id = g.id        -- :1005, :1411, :1417
```

`briefs.game_id` joins the games table **on `id`**, in four places. Rewriting `id` on rows that already
have briefs silently drops those joins — no error, just briefs that stop matching their game.

So: **update the `sport` column only.** It is what drives bucketing, `soccerLeagueSlug()`, the analytics
config key, and display. The id prefix is legacy cosmetics on rows whose ids are already referenced
elsewhere — leave it.

`espn_event_id` is available on all 52, so they are addressable exactly, with no pattern matching:

```sql
-- scoped by the probe's own resolved list, not by a LIKE on the label
UPDATE regular_season_games SET sport = 'MLS' WHERE espn_event_id IN (...52 ids...);
```

Capture before-state and report real row counts, following the sanctioned 537-row MLB reset→refill
template. Note this is a **label** correction, not a `drama_peak` rewrite — it does not touch the
immutability guard.

---

## Why neither is applied

Two reasons, both structural rather than caution for its own sake:

1. **`field-relay-nba` is not in this session's GitHub scope** — only `jeffunglesbee-create/field-playground`
   is. I cannot push the patch without attaching the repo.
2. **A push to `src/**` auto-deploys to production**, and the data fix is a `UPDATE` against production
   D1. Combined with the seeded-row transition window, the deploy wants a chosen moment.

Everything that does not require production access is done: root cause, measurement, the patch, the
migration design, and the standing regression detector.

---

## Confidence gate

**96/100.** The root cause is read directly in the source, not inferred; the scope is measured against
ESPN per event id with 60/60 resolution and zero unresolved; the code/data split is confirmed by the
`espn_event_id` signature aligning perfectly with the three write sites; the patch is syntax-checked; and
the `id`-rewrite hazard is verified against four real JOINs rather than assumed.

The 4-point deduction: **119 of 179 real soccer rows carry no `espn_event_id`** and were not checkable —
they are stored as `"MLS"` and so are almost certainly fine, but "almost certainly" is not measured. The
30-day window contained no EPL / La Liga / Serie A / Bundesliga / Ligue 1 rows at all, so those five
leagues are exposed **by code reading only** — the defect is proven for MLS and inferred for them. And
the deploy-window mitigation is reasoning about the dedup guards, not something I could exercise.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-soccer-league-mislabel-scope.mjs` | new — measures scope, doubles as regression detector |
| `.github/workflows/soccer-league-mislabel-scope-probe.yml` | new — weekly + dispatch |
| `outbox/soccer-league-mislabel-scope-*.txt` | real CI result |
| `docs/pending-relay-fixes/2026-08-06-soccer-league-label.patch` | new — the prepared relay fix, unapplied |
| `docs/outbox/cc-session-2026-08-06-soccer-league-mislabel.md` | new — this doc |
