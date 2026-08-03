# CC Session Outbox — a standing principle, applied immediately

**Date:** 2026-08-03

---

## What was asked

"Always verify the underlying data, not just that it resolves" —
a standing directive following the two real bugs found in the prior
round's probes (uncapped `starScore`, un-normalized `sport_of_week`
casings), both of which shipped un-flagged because their probes'
verdicts only checked whether data resolved and varied.

---

## What was done

**1. Documented as a durable principle**, not left as something said
once in chat: `docs/GROUND-UP-DESIGN.md` principle 10, in the same
incident-traced format as principles 1-9 — every entry in that
document ties to a real event, and this one has two from today.

**2. Applied immediately**, not filed away: the most heavily-depended-
upon real field in this repo, `drama_peak`/`drama_arc`, backs
`TheUnwatched`, `HallOfSurprises`, `BeatTheModel`, `FieldIdentity`, and
`DramaSoundscape` — every one of them assumes `drama_peak` is bounded
to a sane range and exactly equals `Math.max(drama_arc)`. That
assumption had only ever been spot-checked on one real game by hand
(Rays @ Orioles, `TheUnwatched`'s original build). Built
`scripts/probe-drama-peak-validity.mjs` to check both properties across
a broad, real, multi-sport sample instead.

---

## Result

110 real games with a parseable `drama_arc`, spanning MLB/WNBA/MLS/NBA
(NFL returned 0 games — real and reported honestly, not a bug):

- `drama_peak` range: 52–100. Zero values outside `[0, 100]`.
- `drama_peak === Math.max(drama_arc)` held exactly for all 110/110
  games checked.

Both assumptions confirmed valid, not just resolved and varied — the
foundation the last several rounds of work were built on is sound.

---

## Files changed

| Path | Status |
|------|--------|
| `docs/GROUND-UP-DESIGN.md` | modified — new principle 10 |
| `scripts/probe-drama-peak-validity.mjs`, `.github/workflows/drama-peak-validity-probe.yml` | new |
| `outbox/drama-peak-validity-probe-*.txt` | new — real, positive probe result |
| `docs/outbox/cc-session-2026-08-03-verify-underlying-data-principle.md` | new — this doc |
