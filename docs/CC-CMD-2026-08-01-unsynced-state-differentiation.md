# CC-CMD-2026-08-01-unsynced-state-differentiation

**Repo:** field-playground
**Branch:** main — commit directly, do not create a feature branch or PR

One-liner:
```
git remote get-url origin | grep -q field-playground || { echo "WRONG REPO"; exit 1; }
git pull. Read docs/CC-CMD-2026-08-01-unsynced-state-differentiation.md. Execute all tasks.
Do not commit unless confidence >= 95. If score < 95, report verbatim and stop.
```

---

## Why this exists — the fallback itself is fine, this is a real gap next to it

The `atBatIndex` reconciliation shipped earlier today (`docs/outbox/
cc-session-2026-08-01-livewpticker-reconciliation.md`) is sound —
confirmed by reading `joinSamePlay` directly: it searches backward
through Savant's *entire* array for any shared `atBatIndex`, not just
the newest entry, so a genuine "no overlap" result means the two feeds
have recorded zero of the same real at-bats yet. That's an inherent
property of polling two independent external APIs, not an algorithmic
gap — labeling it "unsynced" rather than silently presenting a false
match was the correct, complete fix.

**What's NOT fully fixed:** the UI shows the identical "unsynced —
feeds not yet joined at a shared play" label whether the cause is (a)
one feed's fetch genuinely failing/erroring, or (b) both fetches
succeeding but the game being too early for any overlap yet. These
call for different user expectations — (a) says something's actually
broken, (b) says wait one poll cycle. Confirmed via direct code read:
`joinSamePlay` returning `null` is currently the only signal, and it
can't distinguish its own two possible causes because both fetch
results are already reduced to the same shape before the join is
attempted.

**Also unverified:** the "rare, early in a game" framing in the
original fix's own comment was never measured — it's a reasonable
guess, not a checked fact. This CC-CMD should turn it into one.

---

## Task 1 — Re-verify from HEAD before writing anything (Rule 87)

- Re-read the current `fetchMlbPlays`/`fetchSavantWpa`/`joinSamePlay`
  bodies fresh — confirm today's read still matches, and confirm
  exactly how/where each fetch's success/failure is currently tracked
  (or isn't) before assuming what needs to change.

## Task 2 — Differentiate the two unsynced causes (the real fix)

- Track each source's fetch outcome independently (succeeded-with-data
  / succeeded-empty / failed), not just the joined result.
- When `joinSamePlay` returns null, surface WHICH case applies:
  - Either fetch genuinely failed → a distinct label, e.g. "data
    source unavailable" — this is the case closest to `WpSourceBadge`'s
    existing `unavailable` state elsewhere in this component family;
    reuse that established pattern/wording rather than inventing new
    vocabulary for the same underlying situation.
  - Both fetches succeeded but no `atBatIndex` overlap exists yet →
    keep something like "still syncing" wording, but make it read as
    temporary/expected rather than identical to a failure state.
- No new fallback layer, no defensive guessing — this is a real
  signal that already exists in the fetch results and simply isn't
  being surfaced yet.

## Task 3 — Measure the real duration, don't keep assuming it

- Build a probe (reuse the CI-as-proxy pattern already established for
  both MLB Stats API and Savant this session) that watches a real,
  currently-live or just-started MLB game and records how many poll
  cycles / how much wall-clock time elapses before `joinSamePlay`
  first succeeds, from the game's actual start.
- If no real game is starting within a reasonable window when this
  runs, use the dev mock's synced-scenario test as a documented
  substitute and say so explicitly — don't wait indefinitely for a
  real game, and don't fabricate a number if a real one isn't
  available this run.
- Report the real measurement (or the honest absence of one) in the
  outbox — this replaces "rare, early in a game" with either a real
  number or an explicit, stated gap.

## Task 4 — Smoke + verify

- `node field_smoke.js` (or `smoke.js`, whichever is current — confirm
  fresh, per Task 1) — 0 failures required.
- Real Playwright test, both sub-cases: mock one fetch failing
  entirely (confirm the new "unavailable"-style label appears, not
  generic "unsynced"), and mock both fetches succeeding with
  genuinely non-overlapping `atBatIndex` ranges (confirm the
  "still syncing" wording appears instead).

---

## Explicitly NOT in scope

- Do not change `joinSamePlay`'s search logic itself — confirmed
  already correct and complete for what it can control.
- Do not add retries, timeouts, or any new fallback behavior — this
  task is about accurately labeling an existing real signal, not
  adding new degraded-state handling on top of what's there.

---

## Outbox

`outbox/cc-session-2026-08-01-unsynced-state-differentiation.md`: the
two new label states with real screenshots or DOM text confirming each
fires correctly and independently, and the real measured sync-delay
number (or the explicit statement that no live game was available to
measure this run).
