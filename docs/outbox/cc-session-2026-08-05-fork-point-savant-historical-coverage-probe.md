# CC Session Outbox — Fork Point real-WP feasibility probe

**Date:** 2026-08-05

---

## What was asked

Following "what novel thinking resolves the wp problem?": this repo already has a validated, real
alternative to the missing client-side WP model -- round 3's method (resolve a real MLB `gamePk` from
date+team names via `statsapi.mlb.com`, then read real per-play win probability straight from
`baseballsavant.mlb.com/gf?game_pk=X`). Already proven on a historical sample and re-confirmed against
"today's" leaderboard, but never tested against Fork Point's actual real candidate pool, which draws up
to 50 real games and can span a much wider, older date range than either prior check covered. "Run the
probe" -- confirm coverage before building anything on it.

---

## What was run

`scripts/probe-fork-point-savant-historical-coverage.mjs`, via
`.github/workflows/fork-point-savant-historical-coverage-probe.yml` (CI-as-proxy -- `field-relay-nba`,
`statsapi.mlb.com`, and `baseballsavant.mlb.com` are all sandbox-blocked from chat).

1. Fetched Fork Point's real candidate pool exactly as the component does:
   `/archive/drama/leaderboard?sport=MLB&limit=50`.
2. Found the real date spread: **2026-05-25 to 2026-07-30** (up to 73 days old at probe time).
3. Sampled 13 real games weighted toward the oldest end of that spread (6 oldest, 3 newest, 4 evenly
   spaced through the middle).
4. For each: resolved a real `gamePk` via `statsapi.mlb.com/api/v1/schedule`, then fetched real per-play
   WP (`gameWpa`) via `baseballsavant.mlb.com/gf?game_pk=`.

---

## Result

**13 / 13 real games resolved with real Savant WP data — including the oldest game in the pool**
(Rays @ Orioles, 2026-05-25, 73 days old, 109 real WP points). No failures at any point in the real date
spread this pool actually has.

Full real output: `outbox/fork-point-savant-historical-coverage-probe-2026-08-05T16-55-23-617Z.txt`.

---

## Verdict

**CONFIRMED — no coverage gap found at this sample size.** Real gamePk resolution + real Savant WP data
holds across the full real date spread Fork Point's MLB candidate pool actually has. Splicing real win
probability (instead of the derived `drama_arc` excitement score) is safe to build as the default path
for MLB Fork Point candidates on this exact, already-validated method.

**Still true and unchanged:** this only covers MLB (Savant is MLB-specific) -- MLS/WNBA candidates in the
same pool would stay on the current `drama_arc` splice, disclosed rather than silently mismatched.

**Not proven by this probe:** coverage at a larger sample (all 50, not 13) or over a longer real date
range than this pool currently has (the pool's own oldest date, not an arbitrary "how far back does
Savant go" ceiling) -- both real, disclosed limits of what a 13-game sample can support, not a silent gap.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-fork-point-savant-historical-coverage.mjs` | new |
| `.github/workflows/fork-point-savant-historical-coverage-probe.yml` | new |
| `outbox/fork-point-savant-historical-coverage-probe-2026-08-05T16-55-23-617Z.txt` | new — real CI result |
| `docs/outbox/cc-session-2026-08-05-fork-point-savant-historical-coverage-probe.md` | new — this doc |
