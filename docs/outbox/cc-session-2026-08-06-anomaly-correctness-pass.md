# CC Session Outbox — the correctness pass found a shipped design flaw

**Date:** 2026-08-06

---

## What was asked

"What novel thinking gets the other 12 points accomplished?" then "Build them. Use GitHub actions runner."

Five checks were proposed and all five are built. **They found a real defect in the feature shipped hours
earlier**, which is the point of writing tests that can fail rather than tests that confirm.

---

## The reframe that made this worth doing

The real-corpus probe I built with the feature is **confirmatory**: it runs the shipped code and reports
what that code says. If `quantile()` had an off-by-one, the probe would report a wrong p90 with total
confidence and the run would read as a pass. **Real data executes arithmetic; it does not validate it.**

So four of the five checks need no relay at all — which also means runner contention, the thing that has
blocked verification twice today, stops being on the critical path for correctness.

---

## The headline: a "finding" that described half the population

The null-model probe returned this on the real 470-game corpus:

```
judged: 436;  flagged: 323  (74.1%)
permutation p-value (count >= observed): 1.0000
mean Jaccard overlap between real and shuffled flag sets: 0.770
Jaccard(per-sport, pooled): 0.816
```

**74.1% of judged games flagged.** An anomaly detector that flags three games in four is not an anomaly
detector. My own probe design had written the rule down in advance — *"an 'anomaly' that describes most
games is not an anomaly"* — and then the feature violated it.

**The cause was definitional, not incidental.** `above-typical` tested `peak > median`. Half of any
population satisfies that by construction. Across the three tier-resolution sports (132 real games) it
fired on roughly 60 automatically and dominated the entire output.

That also explains the permutation result. Shuffling sport labels barely changed anything because the
dominant condition was insensitive to bucketing by design — `peak > median` fires at ~50% no matter how
you slice the population.

**Fix:** replaced with `tier-top` — the game reached the highest drama level any real game of its sport
hit in the window. At ~7 distinct values that is genuinely uncommon, and it is expressible at the
resolution the data actually has, which is the reason the tier path exists at all.

Measured on synthetic corpora after the swap:

| | `above-typical` | `tier-top` |
|---|---|---|
| firing rate, tier sport | ~50% by construction | **7.5%** |
| union of all findings, tier sport | — | **19.0%** |
| union of all findings, distribution sport | — | **39.4%** |

---

## The five checks

**1. Definitional self-consistency — the free ground truth.** `rare-high` is *defined* as `peak >= p90`,
so its firing rate is predictable from the distribution itself. Both the offline guard and the
real-corpus probe now compare the module's rate against a **brute-force recomputation** — a deliberately
different implementation. A mismatch is a proof of a quantile bug, not a suspicion.

Worth noting what this caught in passing: the naive expectation "rare-high should fire on ~10%" is
**wrong**, because ties at the boundary inflate it. The synthetic run measured 11.3% and the brute-force
prediction matched exactly. Had I asserted "≈10%" I'd have written a test that fails on correct code.

**2. Metamorphic relations.** Order-independence, monotonicity of percentile in `drama_peak`,
duplication invariance, `p10 ≤ median ≤ p90`, and "a game exactly at the median is neither rare-high nor
rare-low." These catch internally consistent code computing the wrong number — the bug class neither
static types nor schema validation reach. Offline, deterministic (seeded PRNG, never `Math.random`), and
wired into `build-check.yml` so it runs on every build as a fifth guard.

**3. Null-model permutation probe.** Shuffles sport labels with marginals preserved, rebuilds baselines,
re-runs the shipped analysis over 200 trials, reports a p-value and Jaccard overlap. A **pooled
baseline** — the design rejected during the build — runs as a second control, so that rejection is tested
rather than assumed. This is the only check that could conclude the feature is unearned, and it is the
one that found the defect.

**4. Leave-one-out baselines**, exact via index shifting rather than re-sorting, verified against
brute-force removal across every distinct value × 3 quantiles.

**5. Threshold coherence.** A sport with *k* distinct values cannot express finer than 1/*k* resolution,
so decile claims (p10/p90) require *k* ≥ 10. `MIN_DISTINCT_FOR_PERCENTILE = 15` clears it.

---

## The no-op detector earned its place immediately

I wrote check C3 to assert that leave-one-out **changes real outcomes** — because C2 (`LOO p90 <=
in-sample p90`) passed as `68 <= 68`, which proves LOO is *safe*, not that it does anything.

**C3 failed on first run.** LOO never flipped a finding at n = 30/60/120/300. The reason is structural:
percentile findings only run at `distribution` resolution, which needs ≥15 distinct values, and any
population that rich is large enough that dropping one game cannot move the quantile past that game's own
value. **The resolution gate already excluded the bias LOO was added to correct.**

So the code comment I had written — claiming LOO fixes a real bias, "worst exactly where the feature has
the least data" — was overstated. It has been corrected in place, and C3 now reports the flip count as
*informational* on every run rather than failing on a true statement.

**Then the `tier-top` fix made LOO load-bearing after all.** Without applying it to `maxPeak`, the single
highest game in each sport is compared against a maximum **it set itself**, making `peak >= maxPeak`
trivially true for exactly one game per sport. So LOO is inert on the quantile path and essential on the
max path — a distinction I would not have found without a test designed to prove the thing was useless.

---

## New standing guard against the mistake that just shipped

Invariant **E**: no single finding may fire on more than 25% of judged games, and the union of all
findings may not exceed 50%. The union bound matters independently — individually-rare conditions can
still add up to "almost everything," which is a subtler version of the same error.

---

## Findings are now typed, which makes the permutation result readable

Each finding carries `kind: 'distribution' | 'shape'`. `late-surge` and `fizzle` are computed from a
game's **own arc** and should not be expected to respond to shuffled sport labels at all. Lumping them
with the distributional conditions understated how much of the 0.770 overlap was structural rather than
evidence against per-sport framing. The re-run will separate them.

---

## Open, and stated rather than smoothed over

- **The null-model re-run against the fix is still queued.** The 74.1% and the p-value of 1.0000 above are
  from the run *before* `tier-top`. The synthetic evidence that the fix works is strong (7.5% vs ~50%),
  but the real-corpus confirmation has not landed. **The verdict "per-sport framing is not earning its
  complexity" has NOT yet been retested against corrected code**, and it should not be treated as settled
  in either direction.
- **The pooled control is a separate and still-live concern.** `Jaccard(per-sport, pooled) = 0.816` with
  68 games found only by pooled. Even if the per-sport framing survives the re-run, that number says the
  rejected simpler design would produce nearly the same output on the current corpus. That is a real
  question about whether the complexity is worth it, and the `above-typical` fix does not automatically
  answer it.
- The real-corpus probe (with the new definitional check) has never completed a run — queued twice.

---

## Confidence gate

**93/100.** Every claim here is either measured by a deterministic offline check that runs on every build,
or quoted from a real CI run. The correctness pass did what it was built to do: it found a shipped
defect, it found that one of my own fixes was a no-op, and it found that the same fix became necessary
for a different reason after a later change. Those are three results I could not have reasoned my way to.

The 7-point deduction: the null-model re-run has not landed, so the headline verdict is stale by one
commit in a direction I *expect* but have not *measured*; the pooled-baseline overlap remains unresolved
and may yet argue against the design; and the 25%/50% bounds in invariant E are reasoned rather than
derived — defensible, but not measured the way the quantization argument for
`MIN_DISTINCT_FOR_PERCENTILE` is.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/check-anomaly-invariants.mjs` | new — offline, deterministic, 5 sections, wired into `build-check.yml` |
| `scripts/probe-anomaly-null-model.mjs` | new — permutation + pooled controls |
| `.github/workflows/anomaly-null-model-probe.yml` | new — weekly + dispatch |
| `.github/workflows/build-check.yml` | invariants added as a fifth guard |
| `src/data/anomalyBaseline.js` | `above-typical` → `tier-top`; LOO incl. `maxPeak`; findings tagged by kind; overstated LOO comment corrected |
| `scripts/probe-anomaly-watch-real-corpus.mjs` | definitional brute-force cross-check added |
| `scripts/data/anomaly-entry.js` | extended re-export surface |
| `outbox/anomaly-null-model-2026-08-06T16-30-26-746Z.txt` | real CI result — the run that found the defect |
