# chat-update-2026-07-25-history-and-modes

**From:** chat (claude.ai)
**To:** Claude Code, next session in this repo
**Status:** informational
**Repo:** field-playground (main)
**HEAD:** 51c8233
**Covers:** session following chat-update-2026-07-25-solidjs-mechanisms.md and chat-update-2026-07-25-reconciliation.md

---

## Data confirmations — carry these forward

Two proposed items were rejected outright after checking real relay data. Both assumed editorial picks carry a predicted winner. They don't:

**Confirmed editorial pick shape:** `{ game_id, sport, home, away, score, tier, reasons }` — `score` is a drama/quality score (observed value: `1`), not a game result. No team-direction field anywhere. "Editorial direction" doesn't exist as a concept in this data — building either "editorial-vs-PickEm divergence" or "agree with editorial" as proposed would have invented a field and repeated the exact mistake `CrossCheck` caught last round. Avoided by checking the live data first.

**`tier` is a number, not a letter.** Confirmed via live data (`tier: 2`). The existing `.tier_a / .tier_b / .tier_c` CSS classes have never matched real data since they were first written — every tier badge has rendered with zero color coding this whole time. Fixed with numeric classes (`.tier_1`, `.tier_2`, etc.). Direction assumed: tier 1 = highest (common convention, not independently confirmed — worth verifying if the relay ever documents the scale).

**`quality_alert` is a global aggregate, not per-pick.** Shape: `{ alert_count, alerts[], brief }`. Built as a system-wide indicator in AmbientPanel, not a per-pick badge the data doesn't support.

---

## What got built

### `outcomes.js` — richer storage, backward compatible

Extended `setOutcome` with an optional `tier` param. Stored in a separate `pickMeta` map (`field-pick-meta` in localStorage) rather than mixed into the existing `outcomes` shape (`field-pick-outcomes`). Every current consumer of `outcomes` — `PickRow`, `Agreement`, `CrossCheck`, the `untrack` snapshot in DeskCard — is unaffected. Added annotations on the same pattern: per-pick freeform text stored in `pickMeta`, never touching the outcome string.

### `timeOfDay.js` (`src/data/`)

Shared wall-clock-driven mode signal: `morning / midday / evening / late`. A `createSignal` updated by a `setInterval`, reusable across components. Currently drives AmbientPanel's morning de-emphasis (Picks are yesterday's recap before today's slate exists — de-emphasized, not hidden). The signal is module-level so any component can subscribe without owning the timer.

### `AmbientPanel` — annotations, time-of-day, quality_alert, "what would you have picked" mode

- **Annotations:** per-pick text input, stored in `pickMeta`, shown inline below each pick.
- **Time-of-day badge:** surfaces the current mode from `timeOfDay.js`; morning mode visually de-emphasizes the Picks section.
- **`quality_alert` indicator:** renders `alert_count` and `brief` from the relay's global aggregate field. System-wide, not per-pick.
- **"What would you have picked" mode:** gates the entire Picks section behind PickEm completion. Until the user has submitted PickEm picks for the day, editorial Picks are hidden — the rationale is that showing editorial reasoning before your own pick is made turns it into a hint rather than a post-hoc comparison. Once PickEm is done, Picks reveal as a "here's what the editorial said" retrospective. Real product behavior, not just a UI toggle.

### History component (`src/components/History/`)

Three accumulated-history views in one component, all reading `outcomes.js` + `pickMeta` localStorage, zero new fetch:

- **Tier calibration:** W/L/P breakdown per tier level. Shows whether editorial tier actually predicts outcome quality.
- **Pick calendar:** per-date grid of W/L/P results, built from `pickMeta`'s date-keyed entries. The first multi-date view in the app.
- **Multi-day record:** aggregate W/L/P tally across all stored dates, not just today.

This is the Outbox's underlying data model made visible — the same enriched storage that an actual Outbox panel would read.

### DeskCard — empty-night state

Zero games no longer means a blank "No games today." When `deskStore.games` is empty, DeskCard surfaces `truth_is` and `contradiction` from the editorial layer — both exist independently of whether there's anything to score. Real product answer to "what does FIELD show on a dark night."

---

## Real build error — worth recording

A patch adding the empty-night state accidentally dropped the `function SportGroup(props) {` line from DeskCard, breaking the build. Caught by actually running `npm run build` rather than assuming the patch succeeded. Fixed, rebuilt, confirmed 39 modules clean before calling it done. Same discipline applied to the code as everything else in this project, applied to chat's own mistake this time.

---

## Carry-forwards

- `tier` scale direction assumed (1 = highest) but not confirmed. If the relay ever documents the scale or a data check clarifies it, the numeric CSS classes may need reversing.
- `"What would you have picked" mode` gates on PickEm completion — the trigger is whether any PickEm picks exist for the day, not a separate toggle. If a user hasn't used PickEm at all, Picks are always gated. A fallback for non-PickEm users (or a config toggle) would make it more broadly useful.
- History component reads from localStorage only — nothing before the current browser/device is visible. An Outbox that syncs across devices would need a server-side store.
- Nothing from any session today has graduated to `jubilant-bassoon` yet. Per the graduation rule, this remains a real open call.
