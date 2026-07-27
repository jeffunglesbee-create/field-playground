# CC Session Outbox — DeskCard grid-column-shift fix

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#23 (merged)
**Commit:** 8edbd49 (squash merge to main)

---

## What was asked

User-reported bug, with two screenshots of the live DESK panel: "Full
line only appears on completed games." Pregame rows showed team names
truncated to a single letter plus ellipsis ("M..", "D.."); finished
games showed the full "Guardians @ Rays" matchup text.

---

## What was found

`.gameRow` (`DeskCard.module.css`) is a CSS grid with fixed positional
columns:

```css
grid-template-columns: 8px 14px 16px minmax(50px, 1fr) auto minmax(0, 80px) auto auto;
```

Not named grid areas -- a child's column comes from its position among
its siblings, not a stable slot. The `dramaLabel` span was wrapped in
`<Show when={label()}>`, which removes it from the DOM entirely when
there's no drama yet (`drama_peak < 40` -- true for essentially every
pregame row, since drama accumulates over the course of a game).

With that span absent, every later sibling shifted one column left: the
watch-star landed in dramaLabel's 14px column, and team names landed in
the watch-star's 16px column -- while the score area quietly inherited
the wide `1fr` column meant for the matchup text. Finished games usually
reach `drama_peak >= 40` at some point during play, so `dramaLabel`
stayed present and the row rendered with correct alignment -- matching
exactly what the screenshots showed.

Confirmed live before the fix: every pregame row's matchup span measured
16px wide via `getBoundingClientRect()`.

`venue` had the identical latent bug -- also behind a bare `<Show>`,
also the only other conditional child in the row. Not yet reproducible
with the current dev mock (every mock game has a venue), but the same
fix applies for the same reason.

---

## What was built

Both `dramaLabel` and `venue` spans now render unconditionally (empty
when there's nothing to show), so their grid columns are never removed
from the DOM and every sibling's position stays stable regardless of
game state.

---

## CodeRabbit findings -- 0

Clean review, no actionable comments. Only the standard docstring-
coverage warning, which this repo has never treated as a real issue (no
docstring convention exists here).

---

## Verification

`npm run build` clean. Live, before/after comparison: matchup width for
the same pregame games went from a uniform 16px to 119-172px (real width
matching real team names). Screenshot confirms full team names render
correctly across every row regardless of status. Full 7-tab regression
sweep after the fix: zero dead sections, no console errors.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/DeskCard/index.jsx` | modified -- `dramaLabel`/`venue` render unconditionally instead of behind `<Show>` |

---

## What this does NOT change

- No CSS changes -- the grid template itself is unchanged; the fix is
  purely about which DOM nodes are always present so positional columns
  stay stable.
- `mountDebug`'s `<Show when={import.meta.env.DEV}>` is untouched: it's
  either present for every row (dev) or absent for every row (prod),
  never per-row-inconsistent, so it doesn't cause the same class of bug.
