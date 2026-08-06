# CC Session Outbox — anomaly baseline viability probe

**Date:** 2026-08-06

---

## What was asked

"We're still a bit low on surfacing statistical anomalies -- how does that get fixed?" Diagnosis: this
app surfaces **extrema**, not anomalies. Every "insight" is `sorted[0]` of tonight's list -- biggest gap,
most decisive moment, worst score. A real anomaly needs a baseline distribution, a deviation measure, and
an honest "nothing unusual tonight" null state. None exist. Before building any of it: "probe the
historical depth first."

---

## The trap this probe was designed around

The obvious baseline source is `/archive/drama/leaderboard`, but it is **ranked by `drama_peak` and
truncated to top-N** -- a censored sample. Computing "normal" from the 50 most dramatic games makes
normal look extreme and every real game look unremarkable. This repo has already been burned by that
exact shape once (`dramaArcAnalysis.js` documents a biased single-sport/top-N-by-peak check that found
nothing, corrected later by a proper multi-sport probe). So the probe reads `/context/date/{date}` --
the **full real slate per date, boring games included** -- the only uncensored source available.

It measured four real things, not just availability: **depth**, **coverage**, **distribution shape**, and
**unbiasedness**.

---

## Result: VIABLE — and the documented coarseness was a sampling artifact

**30/30 contiguous real dates returned games. 470 real games carrying a real `drama_peak`.**

The make-or-break question was shape. `src/data/dramaWpMovement.js` documents `drama_peak` as coarse --
"every one of the top 8 real games ties at `drama_peak=74` (1/8 distinct)" -- which would have killed
percentile scoring outright. **That coarseness does not hold on an uncensored corpus:**

| Measure | Real value |
|---|---|
| Distinct `drama_peak` values | **34** |
| Most common single value's share | **15.5%** (52) |
| Spread | min 0 · p25 57 · median 62 · p75 70 · p90 78 · max 100 |

The 1/8-distinct figure was an artifact of sampling **the top of a leaderboard**, where everything
clusters at the ceiling by construction. Sampled honestly, `drama_peak` has real, usable variance.
That's a correction to this repo's own prior belief, worth recording so future work doesn't inherit the
wrong conclusion from the older doc.

---

## Three real constraints found (none fatal, all shape the build)

**1. `drama_peak` lags ~3 days behind the slate.** The three most recent real dates returned games but
**zero** with a `drama_peak` (2026-08-06: 0/10, 08-05: 0/12, 08-04: 0/20), while 08-03 was 12/12. It is
evidently populated by a post-hoc analytics pass, not live. **This is the finding that most changes the
feature:** tonight's live games cannot be percentile-scored on this metric at all. The honest framings
are (a) score the most recent *completed and scored* slate rather than "tonight," or (b) score tonight on
a different, immediately-available real signal. Not a blocker -- a reframing that has to be chosen
deliberately rather than papered over.

**2. Real depth is ~90 days, but density collapses after ~30-45.** Spot checks: -45d returned 6 games,
-60d 5 games, -90d 4 games (2 with a peak), -120d 4 games (0 with a peak), -180d and -365d returned
**0 games**. The dense, usable window is the recent ~30 days -- 10-51 real games per date -- which is
exactly what a rolling baseline would want anyway.

**3. Two open data-hygiene questions, not yet answered.** The corpus spans many sports
(MLB/MLS/WNBA/FIFA World Cup/golf/PGA Tour/AFL/NHL) -- whether a golf `drama_peak` is comparable to an
MLB one is unverified, so a single cross-sport baseline may be misleading and per-sport baselines may be
the honest structure (at the cost of smaller per-sport corpora). Separately, **6.8% of the corpus has
`drama_peak` exactly 0** (32 games); whether those are genuinely undramatic games or unplayed/cancelled
ones is unconfirmed, and including them would drag the low end of the distribution down. Both need
checking before percentiles are computed, not after.

---

## Verdict

Percentile/MAD-based anomaly scoring against a real, uncensored 30-day baseline is **safe to build**, on
a corpus of 470 real games with genuine variance -- provided the ~3-day scoring lag is designed for
honestly rather than hidden, and the two data-hygiene questions above are resolved first.

Full real output: `outbox/anomaly-baseline-viability-probe-2026-08-06T01-00-03-282Z.txt`.

---

## Confidence gate

**96/100.** The core question (is there a real, uncensored distribution with usable variance?) is
answered with a real 470-game corpus and a full histogram, and the probe was deliberately designed to
falsify its own premise rather than confirm it -- which it did, overturning the coarseness assumption.
The 4-point deduction is the two disclosed, unresolved hygiene questions (cross-sport comparability, the
6.8% zeros), which are real and would change the numbers a baseline produces.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-anomaly-baseline-viability.mjs` | new |
| `.github/workflows/anomaly-baseline-viability-probe.yml` | new |
| `outbox/anomaly-baseline-viability-probe-2026-08-06T01-00-03-282Z.txt` | new -- real CI result |
| `docs/outbox/cc-session-2026-08-06-anomaly-baseline-viability.md` | new -- this doc |
