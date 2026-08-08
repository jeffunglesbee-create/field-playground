# CC Session Outbox — four reported symptoms, four different causes, one of them mine

**Date:** 2026-08-08

---

## What was asked

A screenshot of the deployed playground, desk on 2026-08-06, showing only MLS with each fixture listed
twice. Then, when I answered too narrowly: *"The point is MLB, WNBA, CFL AND EFL CUP games nowhere to be
found in playground."*

Four symptoms. They turned out to have four unrelated causes, and one of them was a defect in my own
probe.

---

## The correction that made the investigation honest

My first answer measured `/context/date/` for the date in the screenshot, found it genuinely single-sport,
and concluded *"the desk faithfully renders the data."*

**That verified the date, not the claim.** The report was that these sports are missing *generally*, and
one single-sport date says nothing about that. The conclusion happened to be right, but I had no basis
for it when I made it — the same too-narrow-sample error as ordering a build plan before measuring
detection latency, two hours earlier in this session.

What settled it was loading the **deployed site itself** in a real browser, on dates the relay is known to
serve multiple sports for.

---

## 1. MLB / WNBA / EFL Cup — not missing

```
2026-08-07  relay: MLB:15 MLS:14 WNBA:3 EFL Cup:3   page missing: (none)
2026-08-08  relay: EFL Cup:29 MLB:15 MLS:10 WNBA:3  page missing: (none)
2026-08-04  relay: MLB:15 MLS:4 WNBA:1              page missing: (none)
```

Every sport the relay serves, the deployed page renders. The client was independently cleared first, and
locally: `DeskCard` applies no sport filter, `fetchDeskReconciled` passes the response straight through.

**`EFL Cup` is also explained** — 29 games on Aug 8, 3 on Aug 7. A competition starting, not a mislabel.
That closes the flag left open in the previous confidence gate.

---

## 2. The two-day archive gap — real, upstream, not root-caused

```
2026-08-07   35   MLB:15  MLS:14  WNBA:3  EFL Cup:3
2026-08-06   11   MLS:11                              <- no MLB, no WNBA
2026-08-05   12   MLS:12                              <- no MLB, no WNBA
2026-08-04   20   MLB:15  MLS:4  WNBA:1
```

MLB posts a steady 15 rows/day either side and **zero** on exactly those two dates. That is the whole
story for the screenshot, and it is an archive-write question, not a UI one.

Deliberately **not** patched: three plausible causes (cron didn't run / ESPN fetch failed for those slugs
/ rows written under a label `/context/date/` doesn't return) and no evidence separating them. Writing a
fix now would be guessing. The cheapest discriminator is recorded in the pending-fixes entry.

---

## 3. Duplicate fixtures — and a documented assumption that looks wrong

18 duplicate rows across 5 of 14 dates. Cause at `src/index.js:10629`:

```js
const id = series_key
    ? `${sport}_${series_key}_${shortify(round) || 'r'}_${date}`
    : `${sport}_${date}_${idTail}`;
```

Two ids for one match, so `ON CONFLICT` cannot merge them.

**The comment above that line already discloses this** — but calls it transitional: *"duplicate exactly
once on its next resolution … **then self-heals**."*

**The measurement doesn't match that.** Duplicates appear on 08-05, 06, 07 and 08 — current dates, not a
backlog. The likely reason: the pre-game **seed** writes from `gameMeta` (ESPN scoreboard), which carries
no `series_key`, so it always takes the second branch; the **resolution** always has one and takes the
first. Two writers, two id inputs, permanently. Every fixture getting both a seed and a resolution
duplicates once and always will.

Stated as a hypothesis, because that is what it is — consistent with every observed pair (old-scheme row
unscored, new-scheme row final) but not proven. The confirming check is in the pending entry.

---

## 4. CFL — never archived at all

The relay knows CFL in four places (`/cfl/odds-probs`, the CFL internal API, the odds-key table,
`context-assembler`) and polls it in **none**. It is absent from the `LEAGUES` list the archive writer
iterates, so CFL games never enter `/context/date/`. Nothing downstream can show a sport that is never
written.

One-line fix, staged with the slug marked **unverified** — ESPN's scoreboard route is not on the relay's
probe allow-list, so this session could not confirm `football/cfl` resolves. Adding a league that returns
nothing looks exactly like adding one correctly, which is why it is flagged rather than applied.

---

## 5. The "stale deploy" that wasn't — my own bug, third instance today

The freshness check reported all three recent components ABSENT and concluded **DEPLOY IS STALE**.

The same output, four lines above, read `Lab 18` — the section count that only exists once Anomaly Watch
is deployed. **Two signals from one run disagreed and I reported the loud one.**

Cause: `innerText` returns text *as rendered*, and those headers set `text-transform: uppercase`. The DOM
holds `Anomaly Watch`; `innerText` yields `ANOMALY WATCH`. A case-sensitive `includes()` can never match.

**This is the third instance of that exact class today** — the earlier one was a `/score/` regex against a
CSS-uppercased "SCORE", which I fixed myself. Corrected: matching is case-insensitive, and when the two
independent signals disagree the probe now says so and trusts **neither**, instead of reporting whichever
fired.

Re-run confirms: **deploy is current**, all three components render in the Lab tab.

---

## Scoreboard

| Reported | Verdict |
|---|---|
| MLB / WNBA / EFL Cup missing | **Not missing** — render wherever the relay serves them |
| Only MLS on 08-05/06 | **Real** — archive has zero MLB/WNBA rows on those two dates |
| Fixtures listed twice | **Real** — two id schemes, `ON CONFLICT` can't dedupe |
| CFL nowhere | **Real** — never polled, never archived |
| Stale deploy | **No** — deploy current; my probe was broken |

Three staged in `docs/pending-relay-fixes/`. All three live in `field-relay-nba`, where a push to `src/**`
auto-deploys.

---

## Confidence gate

**92/100.** Every verdict is measured rather than argued: sport composition across 14 real dates, the
deployed site driven in a real browser against relay data for the same dates, duplicate pairs printed with
both ids and their scores, and the CFL gap read directly from the relay source. The client was eliminated
locally before any CI run — the ordering lesson from earlier today, applied.

The 8-point deduction:

- **The two-day MLB/WNBA gap is not root-caused.** Three candidate causes, no evidence separating them.
  That's the largest open item and I stopped rather than guess.
- **The duplicate mechanism is a hypothesis.** It fits every observed pair, but I did not confirm the seed
  path cannot obtain a `series_key` — which is what would make "self-heals" definitively wrong.
- **The CFL slug is unverified** and unverifiable from here.
- **Three instances of the same case-sensitivity bug in one day** says my probe-writing has a systematic
  hole, not three unlucky typos. Nothing structural prevents a fourth.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-desk-slate-composition.mjs` | new — per-date sport composition, duplicates, id-scheme census |
| `scripts/probe-deployed-desk-sports.mjs` | new, then corrected twice (Lab tab, case-insensitivity) |
| `.github/workflows/desk-slate-composition-probe.yml` | new |
| `.github/workflows/deployed-desk-sports-probe.yml` | new |
| `docs/pending-relay-fixes/README.md` | 3 entries added |
| `outbox/desk-slate-composition-*.txt`, `deployed-desk-sports-*.txt` | real CI results |
| `docs/outbox/cc-session-2026-08-08-desk-sports-investigation.md` | new — this doc |
