# CC Session Outbox — the measurement that should have come first

**Date:** 2026-08-08

---

## What was asked

"Start with #4 and build all of it" — four pieces of process infrastructure proposed after an extended
architecture exchange with a parallel session (Sonnet 5 Max) about six findings in this repo.

Then, mid-build: **"If a result argues against most of a plan then Claude didn't do enough research."**

That correction is the most important thing in this document, so it goes first.

---

## The research-order failure

I proposed a four-item plan across several turns of analysis. Item #4 — measure how long defects actually
survive here — came back and said most of the plan was unnecessary.

I initially framed that as the process working. It isn't, and the distinguishing test is simple:
**was the falsifier cheaper than the plan?**

| Falsifier | Cost to run first | Verdict |
|---|---|---|
| Null model (2026-08-06) | Needed the built feature **and** a real corpus | Legitimate — couldn't have run earlier |
| Detection latency (this) | `git log`. Local, free, instant | **Not legitimate** — should have been first |

I wrote *"enforce only what's expensive to discover late,"* called it the best idea in the exchange, and
then proposed a build order **without measuring the quantity that filter depends on.** Several turns of
four-class taxonomy and risk-graded automation policy, resting on an unmeasured premise that was one hour
away.

**The correction to my own framing:** the plan wasn't mostly wrong, it was **unranked**. #1 was right, #3
was wrong, and one cheap measurement separated them. Presenting four items with equal confidence was the
error — not the items themselves.

**Rule extracted:** order by cost-of-being-wrong, not by narrative. I ordered by story ("schema is the
biggest gap, build it first") when the cheapest falsifier should have gone first.

---

## #4 — Detection latency: `scripts/probe-detection-latency.mjs`

Blames the lines each fix commit changed back to when they were written. 822 commits, 161 fix commits,
158 blamed file-changes.

```
median introduce -> fix:   35 MINUTES
fixed within 24h:          129 / 158  (81.6%)
survived >= 7 days:          9 / 158  ( 5.7%)   max 11.9d
```

**The enforcement gap is largely theoretical in this repo.** Bugs are not surviving long enough to be
expensive, and blanket automation would solve a problem this codebase doesn't have.

**But the tail is real and concentrated:**

| area | median | p90 | n |
|---|---|---|---|
| `src/data` | 4.1h | **8.2d** | 7 |
| `src/components` | 2.9h | 4.3d | 82 |
| `scripts` | 10m | 1.2h | 42 |
| `.github` | 6m | 4.0h | 14 |

Process infrastructure self-corrects almost immediately. Every one of the nine slowest defects is
application code, and the slowest — `relay.js` double-fire, **11.9 days** — was **silent**.

**Section B confirmed the know→guard lag as a distinct class.** 7 hand-fixes over 8.2 days preceded the
resource-safety guard; 4 over 7.1 days preceded the memo guard. Both then ended their class outright —
**zero matching fixes after either landed.** Guards work; building them is what's slow.

Two honest constructions built in: latencies are **lower bounds** (blame attributes to last touch), and a
fix appearing *after* a guard lands is not scored as a failure, because a guard-caught defect looks
identical to a miss in commit history. The probe prints those commits and says to read them.

---

## #2 — Freshness: `scripts/check-freshness.mjs`

Detects **stale premises, not collisions.** Git surfaces collisions loudly; the quiet hazard is a session
reasoning about a file another session already replaced.

Verified against the exact case that hit this session: a local `origin/main` ref two commits behind the
real remote, reported with the differing files listed. `--strict` exits 1; default warns, because this
repo's operating mode is speed and a hard gate taxes what it exists for. An unreachable remote reports
**"unchecked, not fresh."**

---

## #3 — Colour clustering: `scripts/probe-color-clusters.mjs`

**Demoted to a report by the evidence**, not by preference. CSS defects here are caught in hours
(`AmbientPanel.module.css` 18.9h, `DeskCard.module.css` 7.8h) against a 35-minute overall median. The
class doesn't clear the "expensive to discover late" bar, so it reports and stops.

**It also falsified my own prediction.** I specified it expecting ~168 distinct colours to collapse to
roughly 15 clusters. They collapse to **137** — off by 9×. Recorded in the probe output rather than
quietly dropped.

What *does* collapse is the mass:

```
  2 clusters cover 25% of all 1032 uses
  5 clusters cover 50%
 27 clusters cover 80%
 86 clusters cover 95%
```

So the honest framing is *"a few clusters carry most uses,"* not *"the palette is secretly small."* Also
worth correcting: the real inventory is **1032 occurrences / 168 distinct values**, not the 175 the
original critique cited.

---

## #1 — Schema from measurement: `scripts/schema-from-measurement.mjs`

The one item the latency data endorses — data-shape bugs are silent, and silent is what the tail is made
of.

**Conditional by construction, and it vindicated that immediately.** In BSD alone, **10 fields** would
have been misclassified by a marginal reading:

```
away_score    — required in "period",       but only 22% overall
home_score    — required in "period",       but only 22% overall
player_in     — required in "substitution", but only 47% overall
length        — required in "injuryTime",   but only  9% overall
```

That is the 2026-08-06 error — where I read `home_score` at 22%, called it "too sparsely filled," and
nearly downgraded the preferred soccer fix — caught structurally and permanently. `required` means ≥98%
**within a variant**, never "common overall."

Real generation: `context-date-games` 270 records / 6 variants, `bsd-incidents` 117 records / 5 variants.
Both committed to `src/data/schemas/`.

**A self-inflicted catch worth recording.** The first real `--check` run hit two HTTP 429s, collected 79
of 117 records, and printed **"No drift."** That is exactly the unchecked-vs-unchanged confusion the
script exists to prevent, reproduced inside the script — the `unchecked` counter only fired on *total*
collection failure, so partial rate-limiting sailed through as health. Fixed: fetch failures are counted,
and any target running on failures or under 75% of its original corpus reports **DEGRADED**, with the
verdict refusing to aggregate that into a pass.

**Also surfaced:** a `efl cup` sport variant (32 games) that hadn't appeared in any earlier corpus — worth
knowing before anything buckets by sport.

---

## Not built, and why

| Item | Why not |
|---|---|
| CI auto-commit of fixes | 82% of defects die within a day. Nothing to automate away. |
| `relay.js`-only fetch rule + codemod | No evidence it's near the top of the latency ranking. |
| Duplicate-component manifest | Same. Flag-and-surface at best. |
| Contrast-failure probe (both themes) | The *consequence* version of #3 and the only colour check that would earn a gate. Named so its absence is deliberate. |

---

## Confidence gate

**94/100.**

Every number here is measured, not estimated: the latency figures come from real blame over 822 commits,
the schema variants from 387 real records across two live routes, the colour figures from a full static
sweep of 202 files. Three of the four artifacts caught something real — a wrong prediction, a wrong
verdict inside my own script, and ten fields a naive schema would have frozen as optional. The freshness
check was validated against the specific failure that occurred in this session rather than a synthetic
one.

**The 6-point deduction, specifically:**

- **Latency is a lower bound and I can't quantify by how much.** Blame attributes to last touch, so a
  refactor resets the clock. The 35-minute median is the floor; the true median is worse by an unknown
  factor. That affects the central conclusion.
- **`efl cup` appeared in the corpus and I didn't investigate it.** Given this session already found MLS
  fixtures labelled `FIFA World Cup`, an unexplained new sport label deserves a look before anything
  trusts the sport discriminator.
- **The colour clustering uses CIE76, not ΔE2000.** Adequate for greys, less so for the saturated
  accents, and I didn't quantify the difference.
- **`--check` has run exactly once cleanly and once degraded.** The drift path has never actually
  observed a real drift, so its detection logic is verified by construction rather than by catching
  something.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-detection-latency.mjs` | new |
| `scripts/check-freshness.mjs` | new |
| `scripts/probe-color-clusters.mjs` | new |
| `scripts/schema-from-measurement.mjs` | new, then corrected (degraded-sample handling) |
| `.github/workflows/schema-drift-probe.yml` | new — weekly check, manual generate |
| `src/data/schemas/context-date-games.json` | new — 270 real records, 6 variants |
| `src/data/schemas/bsd-incidents.json` | new — 117 real records, 5 variants |
| `outbox/detection-latency-*.txt`, `color-clusters-*.txt`, `schema-generate-*.txt`, `schema-check-*.txt` | real results |
| `docs/outbox/cc-session-2026-08-08-measure-before-you-plan.md` | new — this doc |
