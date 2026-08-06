# Pending relay fixes

Changes to the relay that are **diagnosed, written, and verified here** but not yet applied.

FIELD is one system across three repos — the client (`jubilant-bassoon`), the relay
(`field-relay-nba`), and this one. A relay defect found while working here is a FIELD defect, and this
directory is where the fix lives until someone deploys it. It is a staging area within the project, not
a stash of foreign material: the diagnosis, the measurement, the probe that found it and the standing
regression detector are all here too.

What holds a patch here rather than in the relay is deployment, not ownership — a push to
`field-relay-nba/src/**` auto-deploys to production, so applying one is a decision with a timing
component. Session repo scope can also mean a given session cannot push there; that is a property of
the session, not of where the work belongs.

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
