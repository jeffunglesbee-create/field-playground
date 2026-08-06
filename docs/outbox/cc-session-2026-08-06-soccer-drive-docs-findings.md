# CC Session Outbox — three soccer Drive docs: a better fix, a root cause, and an IP constraint

**Date:** 2026-08-06

---

## What was asked

"Check those three soccer docs too" -- the remaining unread soccer material on Drive, after the penalty-
dropping bug in `fetchSoccerHistoricalStates` was confirmed. All three were read in full. Each changed
something material, and one of them constrains a feature this session was about to build.

---

## 1. Soccer Data Source Migration (June 26) — a strictly better fix exists

The doc inventories BSD (Bzzoiro Sports Data), already proxied by the relay. Its `/incidents/` endpoint:

```
GET /api/v2/events/{id}/incidents/          Relay alias: /bsd/events/{id}/incidents
{event_id, incidents[{type, minute, is_home, player_in, player_out, player_id,
                      card_type, goal_type, assist, home_score, away_score}]}
Incident types: 'goal' · 'card' · 'substitution' · 'period' · 'injuryTime'
```

**`home_score` and `away_score` are carried on every incident.** That eliminates the entire bug class,
rather than patching it. The current defect exists only because `fetchSoccerHistoricalStates`
*reconstructs* a scoreline by accumulating goals it filtered out of ESPN `keyEvents` -- so any goal the
filter misses (scored penalties) corrupts the running total from that point on. With BSD there is no
accumulation and no filter: the running score is given per incident. A missed-goal bug becomes
structurally impossible, not merely fixed.

It also supplies, for free, what the enrichment probe was chasing: `goal_type` (penalty vs normal
distinguished explicitly), `card_type` (red vs yellow), and substitutions -- all first-class fields.

**Coverage checks out for this use:** MLS is BSD `lid=18`, marked "Full coverage," and `/incidents/` is
confirmed `HTTP 200` live **and** post-match for both club and WC competitions.

**Revised recommendation.** My earlier proposal -- patch the filter to `e.scoringPlay === true` -- is
still correct and still strictly better than substring-matching a display string. But it is now the
*fallback*, not the primary. The primary should be sourcing soccer states from BSD incidents. Both remain
un-applied pending the go/no-go, and the immutability-guard constraint from the previous doc still governs
any historical correction.

**A real doc-vs-reality discrepancy, recorded.** This doc states ESPN `summary.keyEvents` carries
`redCard` and `yellowCard` fields. **The live Aug 6 response does not contain them.** The measured key
union across 115 real keyEvents was: `id, type, period, clock, scoringPlay, source, wallclock, shootout,
team, text, shortText, participants, goalPositionY, fieldPositionX/Y, fieldPosition2X/Y`. Card type
arrives via `type.text` (`"Yellow Card"`) instead. The June 26 field list is partly stale -- worth knowing
before anyone writes code against `e.redCard`.

---

## 2. Soccer Live Intelligence (June 19) — the documented root cause of the coarseness

This doc diagnosed, two months ago, exactly what the 2026-08-06 hygiene probe measured empirically:

> "France-Senegal 0-0 at halftime — to FIELD's drama model, nothing happened. To anyone watching, the
> tension was enormous... The architectural gap: **event-awareness vs state-awareness.** FIELD reacts to
> what just happened. It doesn't evaluate what's currently true."

That is the mechanical reason soccer's `drama_peak` has only **7 distinct values across 59 real games**.
The backfill derives drama almost entirely from goals -- the single rarest event in the sport. A metric
keyed to the rarest event will necessarily be coarse.

The doc already specifies the fix, all of it arithmetic on data ESPN already returns (it explicitly notes
"No FBref, no Opta, no paid APIs. RUWT-clean"): `isMomentumShift` (possession delta > 15% over 20 min),
`isSustainedPressure` (3+ shots on target in 15 min), `isSetPieceBarrage` (4+ corners in 10 min),
`isTacticalBreakdown` (foul rate doubled), `isScorelessTension` (0-0 past 70' with combined SOT > 8).

Its framing is the useful one: **"The scoreline is lying. The score is the last thing to change in
soccer. Everything else changes first."** The enrichment probe's finding (12 yellow cards and 35
substitutions discarded per 4 games) is a small subset of this much larger, already-designed opportunity.

---

## 3. Long Throw Live Cue (June 4) — an IP constraint, but a much narrower one than first written

> **CORRECTED 2026-08-06, after being directed to the push/pull addendum.** The section below originally
> concluded that the anomaly design "conflicts with RUWT" and "needs redesign to boolean/categorical."
> **That conclusion was wrong**, and it was wrong for a specific, checkable reason: I cited a June 4
> artifact as binding without checking whether anything superseded it. Something did — a full corrective
> pass on July 7-8 (commit `01b18e6`). The original text is retained below the line for the record; the
> corrected reading follows.

The June 4 doc's design rules ("Case C / Combo 4") are real and quoted accurately:

> - Boolean-gated, **not continuous interest score**
> - All trigger conditions must fire simultaneously (binary gate, not weighted continuous combination)
> - Output is a **CATEGORICAL** cue, **not an interest-level number**
> - Notification is event-triggered, **not threshold-on-continuous-interest-level**

**But those rules govern a live push cue, and I generalized them to a pull-rendered panel.** Long Throw
Live Cue is a notification. Every clause above is about *what fires an alert*. The anomaly work is a
surface the user opens and reads.

### What the July 7-8 corrective pass actually established

From *FIELD Session — 2026-07-07 to 2026-07-08*, Arc 1:

> "Core finding: **push vs. pull is the actual patent claim boundary, not client/server location.** A
> relay computing and serving a composite score on pull supplies no more of the claimed invention than
> an ordinary scoreboard API."
>
> "Full corrective pass (commit `01b18e6`) found FIVE real contradictions across Rules A/B/C/E, Defense 2,
> PERMITTED #1, PROHIBITED #1-2, and Audit Step 1 — not the three originally assumed."
>
> "**The separate raw-number-display prohibition (PROHIBITED #3-4, Rule D) was independently confirmed
> untouched and still fully enforced throughout** — this is a genuinely separate, still-valid concern
> from the push/pull question."

So a continuous composite, computed and served on pull, is **explicitly permitted**. What survives is a
narrower and entirely different constraint: what may be *rendered*.

### What Rule D / PROHIBITED #3-4 actually prohibit

Read directly from `docs/ADR-002-CONTEXT.md` via the audit that applies it
(`ADR-002 Compliance Audit v2`, and the live citations in `field-relay-nba/src/index.js:963,4503` and
`docs/CC-CMD-2026-07-07-fields-pick-tiered-ranking.md:24-27`):

**PROHIBITED #3** — *"The number itself IS the 'interest level' the patent claims. Even if computed
client-side, displaying `'75'` or `'85% 🔥'` to the user creates evidence of a system that determines and
presents interest levels."*

**PROHIBITED #4** — *"System-determined recommendation without user personalization."*

**Rule D** governs push only: a *"minimal standalone boolean over raw game state... No score, no sum, no
aggregated-value threshold."*

And the framework grades on a five-tier scale, not a binary:

| Tier | Definition |
|---|---|
| CRITICAL | Raw composite number rendered to user |
| HIGH | Composite + **hardcoded** threshold + action, no Drama Dial |
| MODERATE | Composite + **user-controlled** threshold (Defense 1 — mitigated) |
| LOW | Composite used for internal logic, no user-visible output |
| CLEAN | Named binary, factual data, **post-game (amnesty zone)** |

Two further entries in that document's own verified-clean list bear directly here:

- **PERMITTED #4 — win probability display is explicitly permitted**, *"statistical, not interest."*
- **Defense 4 — post-game briefs are in the amnesty zone.**

### The corrected constraint set for the anomaly build

Nothing needs redesigning. Four rules apply, and the design already satisfies or can trivially satisfy
all of them:

1. **Pull-only.** No autonomous alert. field-playground has **no push surface at all** — grepped: zero
   hits for `pushManager` / `showNotification` / `serviceWorker` in `src/` or `public/`. Satisfied by
   construction, not by discipline.
2. **Never render the raw number.** Percentiles, MAD, z-scores may all exist internally; the UI emits a
   named tier. This is the exact shape `computeNightStars` already ships (`starScore` internal-only,
   `stars` 1-5 external) — the July 14 CC-CMD names it as the pattern to preserve.
3. **No hardcoded threshold driving a watch verdict.** A fixed `>= p90 → "must watch"` is the HIGH
   pattern (PROHIBITED #4). Either expose the threshold as a user control (Defense 1 drops it to
   MODERATE/mitigated) or emit a named condition. The latter is better product anyway.
4. **The retrospective framing is in the amnesty zone.** "Last completed slate" is post-game factual
   data — CLEAN. Only the "tonight live" framing carries real constraint, and it carries only #2 and #3.

### Where these constraints actually bind — scoped 2026-08-06

One more correction of altitude, separate from the push/pull one. `docs/OPERATING-MODE.md` states:

> "ADR-002 / RUWT patent-defense constraints don't apply — nothing here ships to FIELD's production
> surface." … "This repo itself never becomes a second production surface."

So the four rules above do **not** gate building the anomaly feature *here*. field-playground is part of
FIELD and permanently separate from production; nothing in it is a production surface. **The constraints
bind at graduation** — when the work is reimplemented in `jubilant-bassoon` / `field-relay-nba` through
the normal CC-CMD process.

That is a scoping correction, not a licence to ignore them. Building the playground version in a shape
that already satisfies all four is strictly cheaper than discovering at graduation that the user-facing
product has to change — and three of the four are satisfied by construction or by good product sense
anyway. What it does mean: no RUWT question blocks the build, and the pull-only requirement is not
something the playground can violate even deliberately, since it has no push surface at all.

**And the specific framing I proposed is the favored one, not the disfavored one.** "This game's drama
and WP movement disagree" is a named condition over win-probability data — PERMITTED #4 material,
rendered as a category. The `drama_peak` immutability guard is still real and still governs any
historical rewrite; that part of the original section stands.

<details>
<summary>Original (superseded) text of this section, retained for the record</summary>

> **This is a problem for the anomaly design as I scoped it.** I proposed percentile/MAD-based scoring
> against a real baseline, surfacing games above an Nth-percentile threshold. That is close to the exact
> shape the RUWT claims describe: a continuous per-game score plus a threshold trigger. It is a closer
> fit to the claims than the existing Drama Dial architecture, which was deliberately built
> boolean-gated to avoid them.
>
> **Redesign implied, not merely a caveat.** An RUWT-safe anomaly feature should surface *categorical,
> boolean-gated* findings rather than a continuous "anomaly score: 87th percentile" with a notification
> threshold.

The error: treating a single-feature push-cue design doc as a project-wide architectural rule, and not
checking for a superseding artifact before calling something binding. The corrective pass was three
weeks newer and directly on point.

</details>

---

## Consolidated state of the soccer thread

| Item | Status |
|---|---|
| Penalty-dropping bug in `fetchSoccerHistoricalStates` | **Confirmed** (18 real scoring events, 16 kept, 2 dropped) |
| Fix via `scoringPlay === true` | Valid **fallback** |
| Fix via BSD `/incidents/` (`home_score`/`away_score` per incident) | **Preferred** -- eliminates the bug class |
| Historical correction | Blocked by immutability guard; sanctioned reset→refill precedent exists (537 MLB rows) |
| Soccer drama coarseness (7 distinct / 59 games) | Root cause documented June 19: event-aware, not state-aware |
| Anomaly feature as scoped (continuous percentile + threshold) | **CORRECTED** -- no redesign needed. Pull-only composite is explicitly permitted (July 7-8 pass). Constraints are: render a named tier not the number (PROHIBITED #3), no hardcoded threshold→verdict (PROHIBITED #4). Retrospective framing is post-game amnesty (CLEAN). |
| ESPN `keyEvents` `redCard`/`yellowCard` fields | Documented but **absent from the live response** -- doc partly stale |

---

## Confidence gate

**Originally 96/100 — the IP section deserved far less, and the confidence gate did not catch it.**

The §3 conclusion was **wrong**, and this doc shipped it at high confidence. The failure was not a
misreading of the June 4 doc (it was quoted correctly); it was declaring a single-feature push-cue design
spec to be a project-wide architectural rule, then not checking whether anything superseded it. A
three-week-newer corrective pass inverted the conclusion. The 4-point deduction I did take named the
right *category* of doubt ("my interpretation of the project's own stated architecture, not legal
advice") but priced it far too cheaply, and it did not name the actual risk: **staleness**. That is
doubly avoidable given this same doc flagged the ESPN `redCard` field list as stale two sections earlier
— I applied a freshness check to a data shape and not to a governing rule.

**Revised: 93/100 on the doc as a whole; §3 now 96/100 on its own.** The corrected constraint set is
quoted from four independent artifacts that agree with each other (the July 7-8 session summary, the
ADR-002 audit v2 applying `ADR-002-CONTEXT.md`, two live source citations in
`field-relay-nba/src/index.js`, and two CC-CMDs), and the pull-only claim for field-playground is
measured, not assumed (zero push-surface grep hits). Remaining deduction: `ADR-002-CONTEXT.md` itself is
not present in either repo visible here — every quotation of PROHIBITED #3-4 and the severity tiers is
second-hand through documents that cite it, consistently but indirectly. Reading the primary source would
close that. Separately, BSD `/incidents/` field shape is still taken from the June 26 doc and has not
been re-probed live, and none of this is legal advice.

---

## Files changed

| Path | Status |
|------|--------|
| `docs/outbox/cc-session-2026-08-06-soccer-drive-docs-findings.md` | new -- this doc |
