# CC Session Outbox — QualityReport Added to the Journalism Tab

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#17 (merged)
**Commit:** 1710214 (squash merge to main)

---

## What was asked

"What's next in the Journalism tab?" -- an exploratory follow-up to the
same-day `JournalismBrief` correction (PR #16). Answered with a
recommendation to deep-search `field-relay-nba` for other real, unused
routes before proposing anything; user asked for the deep search, then
asked to build what it found.

---

## What was found

**`read_source` grepping `field-relay-nba` for `"journalism"`/router
literals returned zero hits again** -- the same tool limitation that
caused PR #15's original error, now correctly *not* treated as a
negative. Instead, searched the `FIELD_Handoff` codex for prior sessions'
own confirmed-real endpoints and direct-probed the candidates.

**`/quality/report` is real, live, and previously unsurfaced anywhere in
this app.** Direct probe confirms: a 7-day rolling editorial-quality
dashboard -- `summary[]` (avg/min/max prose score per real
`brief_type`+`sport` pair actually generated, 18 buckets as of the probe),
`alerts[]` (brief types currently scoring below their own relay-computed
calibrated p25, or flagged `high_failure_rate`), and
`brief_type_calibration` (p25/p50/p75 per type, real sample sizes up to
n=720). 10 real alerts were active at probe time.

**Two things ruled out along the way, both via direct evidence, not
inference:**
- No brief-history endpoint exists -- `/journalism/brief/history` returns
  403 "Path not allowed" (genuinely not allowlisted).
- "The Debrief" (5 narrative layers referenced in the codex's handoff
  history) is assembled client-side from data elsewhere, not its own
  route -- out of scope for a quick addition.

---

## What was built

- `qualityReport` resource in `relay.js`, its own poll cadence (15m --
  slower than `JournalismBrief`'s 5m, since this is a rolling 7-day
  aggregate rather than a single regenerating brief).
- `QualityReport` component: alert-count summary, a per-type/sport score
  table sorted ascending with alert rows highlighted, and the underlying
  alert detail (score vs. threshold, alert kind, sample size).
- Dev mock uses the real captured probe response verbatim, not
  synthesized data -- same convention as every other mock in this repo.
- Rendered in its own `SafeSection` in the Journalism tab, alongside
  `JournalismBrief`, so a failure in either can't take down the other.

---

## CodeRabbit findings -- 3 total, all addressed in one round

1. **Real: `null`/`"all"` sport-key mismatch broke alert highlighting.**
   Summary rows use `sport: null` for the "all sports" bucket (e.g.
   `slate`); alerts use `sport: "all"` for the same bucket. The join key
   was built from each side's raw value, so `slate|null` never matched
   `slate|all` and that alert row was silently never highlighted. Fixed
   with a shared `alertKey()` helper normalizing both sides.
2. **Real: inaccurate alert-summary wording.** "N brief types below
   threshold" is wrong when `alert_count` includes `high_failure_rate`
   alerts whose average is *above* the threshold (e.g. `epl_match`: 146
   vs. a 92 threshold, flagged for failure rate, not for a low average).
   Reworded to neutral "N quality alerts."
3. **Real: alert list didn't disambiguate sport.** The real payload has
   multiple alerts sharing a `brief_type` (two `game_recap`, two
   `pre_game`), rendered with no way to tell them apart. Added the sport
   alongside the brief type in each row.

---

## Verification

`npm run build` clean at both stages. Playwright against the real dev
server confirmed: 10 real alerts render exactly matching the live probe;
all 18 summary rows sorted correctly by score; after the fix, the `slate`
row is correctly highlighted, the alert summary reads "10 quality
alerts," and each alert row shows its sport (e.g. "Epl Match · EPL"); no
console errors; no regression to `JournalismBrief` or `AmbientPanel`.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/relay.js` | modified — new `qualityReport` resource, 15m poll |
| `src/components/QualityReport/index.jsx` | new — alert summary, sorted score table, alert detail list |
| `src/components/QualityReport/QualityReport.module.css` | new |
| `src/App.jsx` | modified — `QualityReport` rendered in its own `SafeSection` in the Journalism tab |
| `src/App.module.css` | modified — `.qualityReport` added to shared section layout class list |
| `vite.config.js` | modified — real captured `/quality/report` mock response |

---

## What this does NOT change

- No relay/data-layer changes -- `field-relay-nba` itself is untouched;
  this only surfaces an existing real endpoint client-side.
- `JournalismBrief` and `AmbientPanel` are unmodified by this PR.
