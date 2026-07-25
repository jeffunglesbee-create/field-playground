# CC Session Outbox — SolidJS Primitives Batch 2
**Date:** 2026-07-25
**PR:** jeffunglesbee-create/field-playground#1 (merged)
**Commit:** d77261276f (squash merge to main)

---

## What was built

Seven playground components, each answering a specific SolidJS question not
previously exercised in this repo.

---

### 1. ContextDemo — `createContext` + `useContext`

**Question:** Does context give meaningfully different ownership and lifetime
than a module-level store? Can the same component tree produce isolated state
per subtree?

**Answer:** Yes on both. Each `SportProvider` instance creates its own
`createSignal` — state that is born when the Provider mounts and destroyed
when it unmounts. Two `Scope` components render the identical tree
(`SportPicker → FilterDisplay → ActiveBadge`) but their selections never
interfere. `ActiveBadge` reads context three levels deep with zero props
passed to it. A module-level `createSignal` would make this impossible —
all consumers would share one value.

**Key usage:**
```js
const SportContext = createContext([() => 'all', () => {}])
function SportProvider(props) {
  const [sport, setSport] = createSignal('all')
  return <SportContext.Provider value={[sport, setSport]}>{props.children}</SportContext.Provider>
}
function useSport() { return useContext(SportContext) }
```

---

### 2. SelectorDemo — `createSelector`

**Question:** Does `createSelector` actually achieve O(1) row-level updates,
and is the difference measurable rather than theoretical?

**Answer:** Measurable. Each row has a `createEffect` that increments a store
counter when its selection check re-evaluates. Naive approach
(`selected() === id`): all 8 rows subscribe to `selected()`, all 8 counters
increment on every click. `createSelector`: only the 2 rows whose result
changes (old → not-selected, new → selected) fire. The counters prove it
live — after N clicks the naive column shows uniform counts across all rows;
the selector column shows only the recently touched rows ahead.

**Key usage:**
```js
const isSelected = createSelector(selB)
// inside For: isSelected(team) fires only when this team's status changes
```

---

### 3. LazyBoundaryDemo — `lazy()` + `ErrorBoundary`

**Question:** Do `lazy()` and `ErrorBoundary` compose cleanly — can a
lazy-loaded component be error-bounded, and does `reset()` avoid
re-downloading the chunk?

**Answer:** Yes. `HeavyPanel.jsx` is a separate Vite chunk (0.78 kB,
confirmed in build output: `HeavyPanel-CVO8wUmj.js`). `<Suspense>` shows a
loading skeleton during the download; `<ErrorBoundary>` catches a
`createMemo` throw inside the loaded panel. `reset()` + signal clear returns
the panel to a healthy state without refetching the chunk — the module cache
holds it. The two mechanisms operate at different phases (async load vs sync
runtime error) and never interfere.

**Key usage:**
```js
const HeavyPanel = lazy(() => import('./HeavyPanel'))
// ...
<Suspense fallback={<Skeleton />}>
  <ErrorBoundary fallback={(err, reset) => <Caught onReset={reset} />}>
    <HeavyPanel />
  </ErrorBoundary>
</Suspense>
```

---

### 4. PropsDemo — `mergeProps` + `splitProps`

**Question:** Do `mergeProps` defaults stay reactive through the merge, or
are they captured as a stale snapshot at call time?

**Answer:** Reactive. `defaultVariant` is a `createSignal` — its current
value is passed as the default to `mergeProps`. When the signal changes,
all `StatChip` instances without an explicit `variant` override update
immediately. The chip with `variant="accent"` ignores the toggle, proving
the override wins as expected. `splitProps` correctly separates own keys from
rest; `onClick`, `title`, and other HTML attributes forward to the element
without any explicit listing.

**Key usage:**
```js
function StatChip(allProps) {
  const withDefaults = mergeProps({ variant: allProps.defaultVariant ?? 'muted', size: 'md' }, allProps)
  const [local, rest] = splitProps(withDefaults, ['label', 'value', 'variant', 'size', 'defaultVariant'])
  return <div class={styles[local.variant]} {...rest}>...</div>
}
```

---

### 5. DateBrowserTransition — `startTransition` against shared `currentDate`

**Question:** Does `startTransition` suppress a `<Suspense>` fallback when
the updated signal is the app-wide `currentDate`, not an isolated signal?

**Answer:** Yes, same behavior as with an isolated signal. The resource reads
`currentDate()` from `relay.js` directly. Transition navigation: Suspense
boundary keeps the old headline visible while the new fetch is in flight.
Batch navigation (`setCurrentDate` called directly): Suspense immediately
replaces content with the skeleton fallback. The shared nature of the signal
means DeskCard, AmbientPanel, and PickEm also respond to the navigation —
this is intentional and labeled in the UI.

**Complement to:** the existing `TransitionDemo`, which uses an independent
signal. This component confirms the mechanism works identically on a signal
that has many other consumers.

---

### 6. ComputedDemo — `createComputed`

**Question:** Does `createComputed` actually fire before render (synchronous
during flush), and is the timing difference from `createEffect` observable?

**Answer:** Yes, and `performance.now()` timestamps in the log prove it.
`createComputed` writes `sorted()` during the same reactive batch as the
`raw()` change. The component always renders with the already-sorted list.
`createEffect` fires after — the log always shows computed entries before
effect entries within the same batch, never interleaved.

**Practical implication:** if `sorted` were derived via `createEffect`, the
component would render once with a stale sorted list, then the effect would
fire and trigger a second render. `createComputed` eliminates that
inconsistency.

**Contrast:** `createMemo` is also synchronous but lazy (computed on first
read, not on signal write) and returns a value. `createComputed` is eager and
has no return value — it's the right tool specifically for "write a signal as
a side effect of another signal, synchronously."

---

### 7. IndexArrayDemo — `indexArray` directly

**Question:** Does `indexArray` actually keep slot components alive across
pushes (vs `mapArray` which remounts on identity change), and is the
difference visible in mount counts?

**Answer:** Confirmed with live mount counters. `indexArray` slot components
mount once (×1) and stay alive — the slot receives the new value via its
reactive `item` signal. `mapArray` slot components remount on every push
because the rolling window creates new object references at every position —
mount count increments per push.

**Key structural difference:**
```js
// indexArray: item is a Signal<T> — stable slot, reactive value
indexArray(events, (item, index) => {
  // item() gives current value; index is a plain number
})

// mapArray: item is T directly — stable when reference is stable, new when not
mapArray(events, (item, index) => {
  // index() is a Signal<number>; item is the reference itself
})
```

For a rolling window where positions are semantically stable but values
rotate, `indexArray` is correct. For a sortable list where items move by
identity, `mapArray` is correct.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/ContextDemo/index.jsx` | created |
| `src/components/ContextDemo/ContextDemo.module.css` | created |
| `src/components/SelectorDemo/index.jsx` | created |
| `src/components/SelectorDemo/SelectorDemo.module.css` | created |
| `src/components/LazyBoundaryDemo/index.jsx` | created |
| `src/components/LazyBoundaryDemo/HeavyPanel.jsx` | created |
| `src/components/LazyBoundaryDemo/LazyBoundaryDemo.module.css` | created |
| `src/components/PropsDemo/index.jsx` | created |
| `src/components/PropsDemo/PropsDemo.module.css` | created |
| `src/components/DateBrowserTransition/index.jsx` | created |
| `src/components/DateBrowserTransition/DateBrowserTransition.module.css` | created |
| `src/components/ComputedDemo/index.jsx` | created |
| `src/components/ComputedDemo/ComputedDemo.module.css` | created |
| `src/components/IndexArrayDemo/index.jsx` | created |
| `src/components/IndexArrayDemo/IndexArrayDemo.module.css` | created |
| `src/App.jsx` | modified — 7 imports, 7 sections |
| `src/App.module.css` | modified — 7 section class names |

Build: clean, 64 modules. `HeavyPanel` correctly split as a separate chunk.

---

## What this does NOT change

- No modifications to existing components (DeskCard, AmbientPanel, PickEm,
  History, etc.)
- No schema or data model changes
- `DateBrowserTransition` reads and writes the shared `currentDate` signal —
  this is intentional for the demo and clearly labeled in the UI
