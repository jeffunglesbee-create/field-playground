# CC Session: Capstone Follow-Up — 2026-07-25

**Covers:** `chat-update-2026-07-25-capstone.md` and everything in the pull

---

## Verification: outcomes sync confirmed

The outbox flagged `initOutcomesSync()` as built-but-not-manually-verified.
The chat then wrote `scripts/verify-outcomes-sync.mjs` and ran it twice:

- **Run 1 (17:44Z): FAIL** — `outcomeBtnClicked: false`. The Picks section
  was still behind the reveal gate; outcome buttons never appeared. Script
  had no gate bypass at that point.

- **Run 2 (17:47Z): PASS** — `allPass: true`, `page2RunningTotal:
  "running total: 1-0-0"`. Added the "show anyway" click before trying
  outcome buttons. Page 2 updated without any interaction.

The SolidJS question is now answered: a tab-external write to `outcomes()`
(an object signal) correctly propagates through all three derived memos in
History — `useTierCalibration`, `useMultiDayRecord`, `usePickCalendar` —
with no manual recheck. The same pattern that confirmed for a string signal
(date sync) generalizes to object signals with multiple downstream derivations.

CI workflow in `.github/workflows/outcomes-sync-check.yml` wires this into
`workflow_dispatch` and commits Playwright artifacts back to the `outbox/`
root (distinct from `docs/outbox/` — that's the text-handoff convention,
this is Playwright screenshots and JSON manifests).

---

## New component: MultiDayStreak

Scales DayComparison's 2-context proof to 5. Creates 5 independent
`createDayContext` instances (one per day back), derives a W/L sequence
for one team across all of them in a single `createMemo`. Real test:
at N=5 concurrent independent resources, does the pattern stay ergonomic
or signal that a different abstraction is needed? Current answer: it works
fine — `createResource` was never actually singleton-only, the pattern
just happens to always have been used that way everywhere else.

Team name sourced dynamically from today's first regular-season game
(`deskStore.games?.regular?.[0]?.home`) rather than hardcoded, so the
component doesn't silently break when the slate changes.

---

## Build

43 modules, clean (up from 41 before this pull).

---

## Open items — status after this session

| Item | Status |
|------|--------|
| Outcomes sync verified | CLOSED — both manifests in repo |
| Gate count mismatch (`NON_MATCHUP_SPORTS` filter) | CLOSED — fixed earlier this session |
| Gate zero-games edge case | CLOSED — `allPicked` now `length === 0 || ...` |
| `NON_MATCHUP_SPORTS` consolidated to one export | CLOSED — cap doc confirms it |
| `shiftDay` double-fetch | OPEN — correctness not affected, still unconfirmed |
| jubilant-bassoon graduation | OPEN — relay-side, undecided per repo's own rule |
| Tier direction (1 = highest) | OPEN — relay not issuing tier 1 in any probed date |
