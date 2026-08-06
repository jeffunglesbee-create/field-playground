# CC Session Outbox — Anomaly Watch, built to the constraints its own probes set

**Date:** 2026-08-06

---

## What was asked

"Build the anomaly feature." Three sessions of probing had established what it must and must not do; this
is the build.

**Shipped:** `src/data/anomalyBaseline.js`, `src/components/AnomalyWatch/`, a corpus resource in
`relay.js`, wired into the Lab tab (count 17 → 18). Builds clean, all four CI guards pass, verified in a
real browser with zero page errors.

---

## The decision that shaped everything: which endpoint

Every existing drama component here reads `/archive/drama/leaderboard`. **This one deliberately does
not**, and that is the single most important thing about it.

That endpoint is ranked **and** truncated, so every row in it is near the maximum by construction.
Building a baseline from it would be a textbook censored sample — and this repo has already paid for that
mistake once. The long-held belief that "drama_peak is too coarse to rank with" came from measuring a
top-N slice; the 2026-08-06 viability probe measured the uncensored slate and found **34 distinct values
across 470 scored games**. The metric was never coarse. The sample was.

So `AnomalyWatch` sweeps `/context/date/{date}` over an N-day window — the real population, not the
podium.

---

## Constraints from the probes, enforced in code rather than remembered

| Measured finding | How the code enforces it |
|---|---|
| Real corpus carries both `WNBA` (69) and `wnba` (6) | `normalizeSport()` case-folds; bucketing without it splits one sport into two undersized wrong buckets |
| MLB p90=83 over 28 distinct; WNBA p90=70 over 7 | per-sport baselines, never pooled — a pooled baseline misranks whole sports by scale mismatch |
| WNBA / soccer carry ~7 distinct values | `resolution: 'tier'` below `MIN_DISTINCT_FOR_PERCENTILE`; the UI says "coarse: only N distinct values exist for this sport, so this is a tier, not a percentile" |
| Golf drama is never computed (`classifySport()` → `'other'`) | excluded by **sport**, not by the value 0 — an earlier probe verdict got this exactly wrong by judging on played-state, and had to be corrected from its own output |
| Golf rows carry object-shaped `drama_arc` | confirmed by the leakage probe; nothing here treats a missing measurement as a boring game |

**No score is rendered.** Findings are named conditions — *Rare high*, *Late surge*, *Fizzled out* — each
carrying the real comparison that made it true, so a reader can check the claim rather than trust a
number. The percentile is computed and used only for ordering, marked `_percentile` to say so. ADR-002
does not bind this repo (nothing here ships), but PROHIBITED #3 is free to satisfy now and expensive to
retrofit at graduation.

**Thresholds are distributional, not magic.** *Flat tension* compares a game's own arc range against its
own sport's median range; *Volatile* compares direction changes against the sport's median. No hardcoded
constants standing in for "unusual."

---

## What it refuses to claim

This is most of the design. Each refusal is stated with a reason and **counted**, never silently dropped:

- **Too-small sport population** → `no-baseline`, "only N real games in this window — too few to call
  anything unusual."
- **Unscored sport** → `not-measured`, naming that drama is never computed for it.
- **In-progress game** → distribution findings still apply (being past the p90 of finished games is a true
  statement about a live game), but arc-**shape** findings are withheld, because a partial arc would
  describe an unfinished story as finished.
- **Partial corpus** → a visible warning naming how many days failed. "12 of 14 days" is a different claim
  from "14 days," and it is what every percentile rests on.
- **Total fetch failure** → the resource **throws** rather than handing callers a baseline built from
  nothing. The distinction between "no games" and "the fetch failed" is exactly what this session's probes
  had to be corrected to make.

---

## Two bugs the browser run caught, in the run itself

**1. The dedupe key was wrong by construction.** I keyed on `_date` — the *fetch* date. The same game
pulled from two dates gets two different fetch dates, so it could never dedupe. The dev mock made this
visible: `mlb 42 games, 3 distinct` on a 14-day window is 3 fixtures × 14 days. Now keyed on the game's
own identity (`game_id` → `id` → `espn_event_id`), with the count of dropped duplicates surfaced in the
UI rather than swallowed — if the corpus contained the same game twice, the population every comparison
rests on was smaller than the row count.

**2. The dev mock cannot validate this feature, and I nearly reported that it had.** The mock embeds the
requested date in each game's `id` (`2026-08-06-mlb-nym-phi`), so its repeated fixtures are genuinely
distinct rows — nothing to dedupe. More importantly it carries **3 distinct `drama_peak` values** where
the real corpus carries ~34. So the local run proves the component renders, handles its states, and
correctly declines to call 3 values a percentile. It proves **nothing** about the percentile path, which
is the feature.

---

## Real-browser verification

Dev server + Playwright (`domcontentloaded`, never `networkidle` — the app polls continuously). Clicked
into the Lab tab, expanded the baseline table:

```
Most unusual on 2026-08-06: Boston Red Sox @ NY Yankees (mlb) — above typical.

  Boston Red Sox @ NY Yankees  5–3  MLB  IN PROGRESS
    ABOVE TYPICAL — above the median real mlb game in this window
      (coarse: only 3 distinct values exist for this sport, so this is a tier, not a percentile)

  Also on this slate: 2 inside normal range, 5 with too small a sport population to judge.

  SPORT  GAMES  DISTINCT  BASIS
  mlb       42         3  coarse tier
  mls       14         1  coarse tier
```

Zero page errors. The honesty machinery works: it labelled the tier as a tier, and it accounted for all 7
non-flagged games instead of leaving them unexplained.

---

## The gap this leaves, and the probe that closes it

`scripts/probe-anomaly-watch-real-corpus.mjs` + weekly workflow. It bundles `src/data` with esbuild and
runs the **shipped** `buildBaselines`/`describeSlate` against the real corpus — not a re-implementation,
which would only prove the copy agrees with itself (the same discipline `probe-golf-zero-leakage.mjs`
uses, and the same stubbing approach that fails loudly on a missing export).

It answers three things the browser cannot:

1. **Does any sport actually reach `distribution` resolution on real data?** If none does, the percentile
   path is dead code and the feature is tier-only — which the UI should say outright.
2. **What is each named condition's real firing rate?** A condition that never fires is decoration. One
   firing on >50% of games is not an anomaly. Both are reported explicitly.
3. **Are the excluded sports excluded for the stated reason?**

It is scheduled weekly rather than run once, because firing rates are exactly what rots silently: a
detector that stops detecting looks identical to one with nothing to report.

**Status: triggered, still queued on a GitHub runner at the time of writing.** The percentile path is
therefore **verified by construction and by the unit of the corpus probe's own earlier measurements, but
not yet exercised end-to-end on real data.** That is the honest state, and it is the main deduction below.

---

## Known contamination, surfaced rather than silently corrected

The UI states it, in the baseline table: 52 of 60 checkable rows labelled `FIFA World Cup` are really MLS
(measured today). That bucket is a mix until the relay label fix ships. Rather than guess a correction —
inference is what created the bug — the component names the contamination where a reader will see it
alongside the numbers it affects.

---

## Confidence gate

**88/100.** The design constraints are all traceable to real measurements in this session's own probes
rather than to preference; the build passes every existing CI guard and a real browser run with no page
errors; and the browser run caught two real defects, one of which (the fetch-date dedupe key) would have
been invisible in production.

The 12-point deduction is concentrated in one place and I would rather state it plainly than average it
away: **the percentile path has not been exercised against real data yet.** The dev mock structurally
cannot do it (3 distinct values vs ~34), the CI probe that can is still queued, and until it returns,
"MLB reaches distribution resolution" is an expectation carried over from the hygiene probe's numbers, not
a verified property of this code. Also unverified: no condition's real firing rate is known, so any of the
seven could be decoration or over-firing; and `MIN_DISTINCT_FOR_PERCENTILE = 15` / `MIN_GAMES_FOR_BASELINE
= 20` are reasoned thresholds sitting between the measured 7 and 28, not empirically tuned.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/anomalyBaseline.js` | new — baselines, named conditions, all refusals |
| `src/data/relay.js` | `anomalyCorpus` resource sweeping the uncensored slate; reuses existing `shiftDateStr` rather than redefining it |
| `src/components/AnomalyWatch/index.jsx` + `.module.css` | new |
| `src/App.jsx`, `src/App.module.css` | wired into the Lab tab |
| `scripts/probe-anomaly-watch-real-corpus.mjs` | new — runs the shipped module on real data |
| `scripts/data/anomaly-entry.js` | new — esbuild re-export surface, no logic |
| `.github/workflows/anomaly-watch-real-corpus-probe.yml` | new — weekly + dispatch |
| `docs/outbox/cc-session-2026-08-06-anomaly-watch-build.md` | new — this doc |
