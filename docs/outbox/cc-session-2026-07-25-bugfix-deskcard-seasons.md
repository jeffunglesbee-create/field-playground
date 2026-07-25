# CC Session Outbox — DeskCard Truncation + Seasons Disappearance
**Date:** 2026-07-25
**PR:** jeffunglesbee-create/field-playground#2 (merged)
**Commit:** 114478a95b (squash merge to main)

---

## What was fixed

Two bugs reported via screenshot (IMG_9659).

---

### 1. DeskCard matchup truncated to a single character

**Symptom:** Matchup text like "Rangers vs Flyers — 3-2 F" rendered as "R… 3-2 F".

**Root cause:** CSS Grid layout. The `.gameRow` template was:

```css
grid-template-columns: 8px 14px 16px 1fr auto auto auto auto;
```

The four `auto` columns — scoreArea (~120px, includes the countdown),
venue (max-width 100px), dismissBtn (~20px), mountDebug label (~20px) —
totalled ~260px. Add 38px of fixed-width columns and 42px of 6px × 7
gaps and the sum was ~340px. On a ~200px portrait phone container that
leaves `1fr` = 0px. `text-overflow: ellipsis` on a 0px column produces
exactly one character and an ellipsis.

**Fix:**

```css
/* before */
grid-template-columns: 8px 14px 16px 1fr auto auto auto auto;

/* after */
grid-template-columns: 8px 14px 16px minmax(50px, 1fr) auto minmax(0, 80px) auto auto;
```

`minmax(50px, 1fr)` guarantees the matchup column at least 50px
regardless of what the auto columns do. `minmax(0, 80px)` on the venue
column gives the browser permission to shrink it below its natural
content width (previously it was just `auto`, which sets a floor at the
content's intrinsic size). `.venue` max-width reduced from 100px to
80px to match.

**File:** `src/components/DeskCard/DeskCard.module.css`

---

### 2. Seasons section silently disappeared

**Symptom:** The entire Seasons section — including its Suspense skeleton
— was gone from the layout with no error visible. User confirmed no
deliberate removal was requested.

**Root cause:** `<Seasons>` was wrapped in `<Suspense>` but not in
`<ErrorBoundary>`. Three relay resources back the component:
`wcStandings`, `mlbStandings`, `mlsStandings`. Each is a `createResource`
with a fetcher that throws on non-200 responses. When a relay endpoint
is unhealthy, the resource accessor throws in error state. SolidJS
propagates unhandled resource errors up the component tree; without a
boundary to catch the throw, the entire Seasons subtree — including the
Suspense fallback — is removed silently.

The code itself was untouched and correct; no commit had modified
Seasons, relay.js, or the App.jsx Seasons section. The disappearance was
a runtime failure, not a code regression.

**Fix:** Added `<ErrorBoundary>` inside the existing `<Suspense>`:

```jsx
/* before */
<Suspense fallback={<Skeleton />}>
  <Seasons />
</Suspense>

/* after */
<Suspense fallback={<Skeleton />}>
  <ErrorBoundary fallback={err => <div style="font-size:11px;color:#c44;padding:8px 0">{err.message}</div>}>
    <Seasons />
  </ErrorBoundary>
</Suspense>
```

Failures now surface the relay error message rather than removing the
section. The fix is minimal — no retry logic, no custom UI — because
the Seasons data is non-critical and the error text is enough context
to know which endpoint is down.

**File:** `src/App.jsx`

---

## Files changed

| Path | Change |
|------|--------|
| `src/components/DeskCard/DeskCard.module.css` | `.gameRow` grid template + `.venue` max-width |
| `src/App.jsx` | `ErrorBoundary` import + wrapping `<Seasons>` |

Build: clean, 64 modules, unchanged chunk count.

---

## What this does NOT change

- No logic changes to DeskCard, Seasons, or relay.js
- `mountDebug` label (the `auto` column that contributes to the overflow)
  is a DEV-only element; the fix is correct in both dev and production
  since `minmax(0, 80px)` on venue handles whichever columns actually
  render
- No change to Seasons' data sources or rendering logic — the ErrorBoundary
  is purely a containment boundary, not a behavioral change
