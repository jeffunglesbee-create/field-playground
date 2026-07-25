# chat-update-2026-07-25-capstone

**From:** chat (claude.ai)
**To:** Claude Code, next session in this repo
**Status:** informational — summary and index, not a restatement
**Repo:** field-playground (main)
**Covers:** everything since `chat-update-2026-07-25-for-claude-code.md`

---

This is deliberately short. The detailed work is already written up in
five prior outbox entries from today — this indexes them and pulls out
what's cross-cutting, rather than repeating what's already there:

- `chat-update-2026-07-25-solidjs-mechanisms.md` — six SolidJS
  primitives (`createRoot` disposal, `untrack`, drag-reorder via
  `produce()`, `batch`, `lazy`+`Suspense`, three-source derived state)
- `chat-update-2026-07-25-reconciliation.md` — the `Agreement`/
  `CrossCheck` overlap, and the semantic bug `CrossCheck`'s reasoning
  caught in `Agreement`
- `chat-update-2026-07-25-history-and-modes.md` — tier calibration,
  pick calendar, the real tier-number bug, `quality_alert`'s real
  (global, not per-pick) shape
- `chat-update-2026-07-25-pattern-note.md` — corrected mid-thread once
  the actual mechanism was explained: these files are Claude Code
  double-checking chat's work via screenshots, not two sessions
  colliding
- `cc-session-2026-07-25-carry-forward-resolutions.md` — the real
  `allPicked()` gate bug, and `initOutcomesSync()`

---

## Worth stating plainly, cross-cutting

**The double-check mechanism is working as intended, both directions.**
Confirmed this session: it catches real bugs (the `Agreement` semantic
error, the `allPicked()` gate bug), and it also sometimes just confirms
— both are the system working, not a sign of redundancy. Also confirmed
directly, mid-turn: the repo can change *while* chat is mid-investigation,
not just between turns — caught `TensionCard` appearing between two
reads of the same file inside one response.

**A real, evenhandedness lesson from the drama-hierarchy question:**
after several turns of catching wrong assumptions (tier-as-letter,
editorial-implies-winner, `start_time`, `quality_alert` scope), chat
leaned toward assuming a new claim (`drama_peak`/`drama_arc`, "high/
medium/low") would also be wrong. It wasn't — the fields are real, and
the actual implementation ported real production thresholds from
`jubilant-bassoon`'s `dramaTier`/`dramaLabel` rather than inventing new
ones. A streak of correct catches isn't license to stop checking in the
other direction — worth remembering next time a proposal reads as
"probably another wrong assumption."

**`NON_MATCHUP_SPORTS` now lives in one place.** It was duplicated
between `PickEm` and `DeskCard`, diverged once already (`pga`/`atp`/
`wta` added to one copy, not the other), and is now a single shared
export. Worth treating as the general pattern for any future sport-list
or similarly small shared constant — one export, not parallel copies.

---

## Current state

Build: clean, 43 modules, verified fresh before this note was written.

Genuinely new components added today: `Agreement`, `CrossCheck`,
`CreateRootDemo`, `History`, `MultiDayStreak`, plus substantial
extensions to `AmbientPanel` (drag-reorder, annotations, tension card,
prose-navigation, quality texture, time-of-day mode) and `DeskCard`
(drama hierarchy, freshness dimming, tell-me-more expansion, dismiss/
focus mode, sport spotlight, optimistic score edit).

## Still open

- Nothing from today has graduated to `jubilant-bassoon`. Per this
  repo's own graduation-checkpoint rule, that's a live, undecided call,
  not an oversight — worth a real look next time product priorities are
  being set, not left implicit again.
- `shiftDay`'s likely-redundant double fetch (flagged earlier, still
  unconfirmed either way — correctness isn't affected, just possibly a
  wasted network call).
- Tier-scale direction (1 = highest) remains an assumption the relay
  hasn't issued data to confirm or deny.
