# CC Session Outbox — SERVICE_MAP expansion to major national networks

**Date:** 2026-07-28
**Branch:** `claude/playground-setup-njng55`
**Commits:** 1fb3fd7 (expansion), 8614b91 (CI probe result, verification)
**CI runs:** [30405232819](https://github.com/jeffunglesbee-create/field-playground/actions/runs/30405232819) (baseline, on `main`), [30406477402](https://github.com/jeffunglesbee-create/field-playground/actions/runs/30406477402) (post-expansion, on this branch)

---

## What was asked

Following the streams-availability probe (see
`cc-session-2026-07-28-tonights-pick.md`), which found `SERVICE_MAP`
only resolved 32% of real stream label mentions, the user asked to
expand it to cover the major networks.

---

## What was built

Added 21 new `SERVICE_MAP` patterns for national networks the table
had never covered: ESPN's linear/cable channel (distinct from ESPN+,
already mapped), TBS, FS1, NBA TV, MLB Network, CNBC, Golf Channel,
ION, NBCSN, Disney+, WNBA League Pass, TV Azteca, FOX Deportes, FOX
One, and the four US broadcast networks (FOX, CBS, NBC, ABC).

Patterns for the bare national brands are anchored (`^...$`) since the
real data has same-named local/regional variants that must NOT
collide: "FOX" must not match "Fox 5 WTTG" (DC affiliate) or "FOX
Deportes" (different product); "Sportsnet" must not match "Sportsnet
LA" (a Dodgers regional feed, not the Canadian national network).
Local broadcast affiliate call signs themselves (`KMSP-TV`, `WPIX`,
`KING 5`, ...) are deliberately still unmapped — there are effectively
unbounded many, market-specific rather than a single ownable product,
and mapping them would be exactly the over-fitting `SERVICE_MAP` has
avoided since it was written.

**A new honest category, not just more matches.** FOX/CBS/NBC/ABC get
a `free: true` flag (`FREE_BROADCAST` set) instead of a `PRICES`
entry — they're broadcast networks, free over the air by US law, which
is a known fact, not a price this table doesn't happen to have. The
cable-only nationals (ESPN linear, TBS, FS1, NBA TV, MLB Network, ...)
get no `PRICES` entry either — they're sold bundled into cable/live-TV
packages (already priced under `youtubetv`/`fubo`/`hulu`/`sling`/
`directv`), never standalone, so inventing a number for them would be
exactly the guessed cost this whole session has avoided.

`free` flows through `parseStreams()` into three places:
- The My Services modal: a distinct "free" tag instead of the generic
  "?" unpriced badge.
- Arbitrage's `marginal()` ("cheapest way to reach what you can't"):
  free services get `costPerGame: 0`, correctly sorting ahead of every
  paid option — the recommendation list can now genuinely say "just
  watch it on FOX" instead of treating it the same as an unknown gap.
- TonightsPick's `cheapestStream()`: free beats even an already-owned
  paid service, since it needs no subscription at all.

`unpricedCount` and the "not in the price table" collapsible section
were updated to exclude free services — they're not a gap, they're a
known $0.

---

## Verification

- `npm run build` clean, 146 modules, both before and after.
- **Not exercised in this sandbox's dev server.** `vite.config.js`'s
  dev-mode mock relay (`configureServer` middleware, intercepting
  `/context/date/*`) has zero `streams:` fields on any fixture game.
  Discovered this while trying to verify the expansion live: every
  earlier "confirmed live in-browser against the real relay" claim
  this session (line-movement, ScoreTicker/Arbitrage verification,
  TonightsPick) was actually against this local mock for the
  `/context/date` endpoint, not the real relay — the mock does include
  real-probed `drama_peak`/`opening_odds`/`closing_odds` fields (per
  its own header comment), just never `streams`. The weatherData crash
  fix from the TonightsPick session is unaffected by this — that was a
  code-structure bug (calling an errored resource unconditionally)
  independent of which data source produced the error state. Flagging
  this plainly rather than letting the earlier claims stand
  uncorrected.
- **Verified instead via CI, before/after, against real data:**
  reran `scripts/probe-streams-availability.mjs` (the same probe that
  found the original 32% gap) against this branch's own updated
  `Arbitrage/index.jsx` on a GitHub Actions runner (`ref:
  claude/playground-setup-njng55`, workflow run 30406477402).
  - Match rate: **325/1020 (32%) → 473/1020 (46%)** of real label
    mentions across the same -21/+7 day window.
  - The remaining 547 unmatched labels are now *exactly* the two
    intentionally-excluded categories: team RSN feeds (`Royals.TV`,
    `Brewers.TV`, `MASN`, `NESN`, `SNY`, ...) and local broadcast
    affiliate call signs (`KMSP-TV`, `WPIX`, `KING 5`, `Fox 5 WTTG`,
    ...). Zero unintended matches leaked in — `Sportsnet LA` and `FOX
    Deportes`/`Fox 12 Plus`/`Fox 5 New York` all correctly stayed
    distinct from the new bare `Sportsnet`/`FOX` patterns, confirming
    the anchoring works as designed against real data, not just the
    synthetic cases it was reasoned through.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/Arbitrage/index.jsx` | modified — 21 new `SERVICE_MAP` patterns, `FREE_BROADCAST` set, `free` flows through `parseStreams`/`marginal`/`unpricedCount` |
| `src/components/Arbitrage/Arbitrage.module.css` | modified — `.chipFree`/`.freeTag` styles |
| `src/components/TonightsPick/index.jsx` | modified — `cheapestStream()` recognizes `free`, ranks it above owned/priced |
| `outbox/streams-availability-probe-2026-07-28T22-58-54-383Z.txt` | new — post-expansion CI probe result |
