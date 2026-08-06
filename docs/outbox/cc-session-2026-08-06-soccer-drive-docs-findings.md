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

## 3. Long Throw Live Cue (June 4) — an IP constraint on the anomaly feature

Mostly a patent-novelty analysis, but it contains a binding architectural rule that **directly constrains
the statistical-anomaly work scoped earlier this session.**

FIELD's RUWT patent-defense architecture ("Case C / Combo 4") requires:

> - Boolean-gated, **not continuous interest score**
> - All trigger conditions must fire simultaneously (binary gate, not weighted continuous combination)
> - Output is a **CATEGORICAL** cue, **not an interest-level number**
> - Notification is event-triggered, **not threshold-on-continuous-interest-level**

The RUWT family (US 9,421,446 / 9,744,427 / 10,328,326) is *"Rating system for identifying exciting
sporting events and notifying users"* -- a game-level interest score plus threshold notification.

**This is a problem for the anomaly design as I scoped it.** I proposed percentile/MAD-based scoring
against a real baseline, surfacing games above an Nth-percentile threshold. That is close to the exact
shape the RUWT claims describe: a continuous per-game score plus a threshold trigger. It is a closer fit
to the claims than the existing Drama Dial architecture, which was deliberately built boolean-gated to
avoid them.

This also explains, consistently, the `drama_peak` immutability guard from the previous doc -- rooted in
`'326` claim 1 triggering on *"the rating...has changed."* There is one coherent IP posture across this
project, and my proposed design cuts against it.

**Redesign implied, not merely a caveat.** An RUWT-safe anomaly feature should surface *categorical,
boolean-gated* findings ("this game's drama and WP movement disagree" -- a named condition, either true or
false) rather than a continuous "anomaly score: 87th percentile" with a notification threshold. The
percentile machinery can still exist internally as the *derivation*; what must not ship is a continuous
per-game interest number with a threshold alert as the user-facing product.

I am flagging this rather than deciding it. It is a legal/IP judgement, and the existing precedent is
clear enough that building the continuous version first and asking later would be the wrong order.

---

## Consolidated state of the soccer thread

| Item | Status |
|---|---|
| Penalty-dropping bug in `fetchSoccerHistoricalStates` | **Confirmed** (18 real scoring events, 16 kept, 2 dropped) |
| Fix via `scoringPlay === true` | Valid **fallback** |
| Fix via BSD `/incidents/` (`home_score`/`away_score` per incident) | **Preferred** -- eliminates the bug class |
| Historical correction | Blocked by immutability guard; sanctioned reset→refill precedent exists (537 MLB rows) |
| Soccer drama coarseness (7 distinct / 59 games) | Root cause documented June 19: event-aware, not state-aware |
| Anomaly feature as scoped (continuous percentile + threshold) | **Conflicts with RUWT patent-defense architecture** -- needs redesign to boolean/categorical |
| ESPN `keyEvents` `redCard`/`yellowCard` fields | Documented but **absent from the live response** -- doc partly stale |

---

## Confidence gate

**96/100.** All three docs read in full, and every claim above is either quoted from them or measured
directly by this session's probes against real data. The doc-vs-reality discrepancy on
`redCard`/`yellowCard` was caught precisely because the probe measured the live shape instead of trusting
the doc. The 4-point deduction: BSD `/incidents/` field shape is taken from the June 26 doc and has **not**
been re-probed live this session (the same staleness that bit the ESPN field list could apply to it), and
the RUWT/IP reading is my interpretation of the project's own stated architecture, not legal advice --
a human should confirm the constraint before any redesign is committed to.

---

## Files changed

| Path | Status |
|------|--------|
| `docs/outbox/cc-session-2026-08-06-soccer-drive-docs-findings.md` | new -- this doc |
