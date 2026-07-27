# CC Session Outbox — GameRow explicit grid-column assignment

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#24 (merged)
**Commit:** 3640130 (squash merge to main)

---

## What was asked

Follow-up to #23. Chat's independent review of that fix flagged a
genuine structural gap: `.gameRow` is 8 positional grid columns with no
named areas, so a child's column comes from its position among its
siblings, not a stable slot. #23 fixed the two children (`dramaLabel`,
`venue`) that had already been caught vanishing behind a bare `<Show>`
and shifting everything after them -- but the underlying grid was still
fragile by construction. Any future conditional child, on any of the
other six spans/buttons in the row, would reintroduce the identical bug.

---

## What was built

Every direct child of `.gameRow` now gets an explicit `grid-column` (1
through 8, matching `grid-template-columns`' order), so a child's
column is a property of its own CSS rule rather than a side effect of
which siblings happen to be mounted at the time. `.gameExpansion`
already used this exact pattern (`grid-column: 1 / -1`) for the same
reason -- this extends it to the rest of the row.

---

## CodeRabbit findings -- 1, real, addressed

1. **Comment overstated the fix's scope.** The original comment claimed
   explicit grid-column assignment made the whole column-shift bug
   class "impossible" -- true for the current eight children, false for
   any ninth child added later without its own assignment. Narrowed the
   comment to say exactly that, and dropped an unrelated cross-reference
   to index.jsx's dramaLabel/venue mounting fix (a separate mechanism --
   what stays mounted -- from this one -- what column a mounted child
   gets).

---

## Verification

`npm run build` clean. Live: matchup width for the same pregame games
(119-172px) and watch-star width (16px) match #23's already-fixed state
exactly -- no regression, no change in rendered layout. Full 7-tab
sweep: zero dead sections, no console errors.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/DeskCard/DeskCard.module.css` | modified -- explicit `grid-column` added to all 8 positional children of `.gameRow` |

---

## What this does NOT change

- No visual/layout change -- purely a robustness fix; the same fixed
  state from #23 is preserved, just no longer contingent on DOM order.
