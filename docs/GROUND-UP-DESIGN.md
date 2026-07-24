# Ground-Up Design: Desk card + Ambient panel in SolidJS

## The experiment question (restated)

field.js is ~45k lines of hand-rolled DOM manipulation. Two real bugs from
one session illustrate the structural gap:

1. **Skeleton overlap** — a loading skeleton never gets told to disappear
   because nothing enforces "old node out before new node in."
2. **Chip overflow** — a chip component has no overflow handling because CSS
   containment isn't anyone's job to remember.

Would a real component framework make those categories of bug **harder to
write**, not just easier to catch? That's the question. Done when we have a
concrete yes-or-no with an example.

---

## Why SolidJS specifically

React would be fine. SolidJS is better *for this question* because of how
its reactivity model maps onto the bugs above.

**Components run once.** A SolidJS component function is a setup function,
not a render function. It runs exactly once, wires up signals and effects,
and then the reactive system handles all subsequent updates. This means
there is no "re-render path" that can accidentally leave old state alive —
there is only "the reactive graph updates."

**Effects clean up automatically.** `createEffect` tracks its own
dependencies and re-runs when they change. When a component unmounts, every
effect and resource inside it is disposed. The "skeleton never told to
disappear" bug is structurally awkward to write here: the template's
`<Show when={...}>` is literally not a call you make — it's a reactive
expression that's always correct by construction.

**`createResource` makes async state explicit.** Loading, error, and
resolved states are a first-class union, not an optional flag you might
forget to set. A skeleton that never disappears would require actively
ignoring the `loading` property.

**Fine-grained reactivity, no VDOM.** Updates are surgical — only the DOM
nodes whose dependencies changed get touched. This makes the reconciliation
behavior predictable and inspectable, which is useful when the experiment is
specifically about reconciliation correctness.

---

## Architecture

```
src/
  main.jsx           — mounts App to #root
  App.jsx            — layout shell, renders DeskCard + AmbientPanel
  data/
    relay.js         — createResource wrappers over relay endpoints
  components/
    DeskCard/
      index.jsx      — Desk card component
      DeskCard.css   — scoped styles
    AmbientPanel/
      index.jsx      — Ambient panel component
      AmbientPanel.css
  lib/
    relay-client.js  — raw fetch helpers (base URL, error handling)
```

### Data layer

All data is read-only, from the relay's existing public endpoints. Each
endpoint maps to a `createResource` call in `relay.js`. Components consume
the resource directly — no intermediate store, no cache, no local state
duplication.

Relay endpoint base URL: TBD (probe via FIELD_Handoff `probe_relay_route`
or wire in manually once known).

Target endpoints:
- Ambient panel data — live/upcoming games, scores, clock state
- Desk card data — current game context, boxscore summary

```js
// relay.js pattern
export const [ambientData] = createResource(fetchAmbient)
export const [deskData]    = createResource(fetchDesk)
```

### Component contract

Each component receives its resource directly and handles its own
loading/error/resolved states using `<Show>` and `<Suspense>`. No prop
drilling for loading flags, no parent managing skeleton visibility.

```jsx
// AmbientPanel.jsx — structural skeleton-bug resistance
export function AmbientPanel() {
  return (
    <Show when={ambientData()} fallback={<AmbientSkeleton />}>
      {(data) => <AmbientContent data={data} />}
    </Show>
  )
}
```

The skeleton appears when `ambientData()` is undefined and disappears the
moment it resolves — there is no code path where the skeleton can linger.

---

## The specific structural tests

### Test 1: skeleton-overlap bug

**In field.js:** nothing enforced "clear old content before mounting new."
**In SolidJS:** `<Show>` is a reactive expression; "old content visible when
new is mounted" requires actively returning incorrect JSX. It's not an
omission that could happen by accident.

Expected result: this category of bug is structurally hard to write.

### Test 2: containment / overflow

**In field.js:** CSS containment was nobody's job. **In SolidJS (with
component-scoped CSS):** each component file owns its styles. Overflow
handling on the chip would be a missing line in `DeskCard.css`, which is
adjacent to the template that uses it and visually obvious in review.

Expected result: this isn't prevented structurally the same way — it's still
an omission — but the omission is more visible and localized.

---

## Done criteria

Same as the experiment doc:

1. The surface renders real Desk + Ambient data correctly.
2. Side-by-side visual comparison with production passes.
3. There's a concrete, honest answer to the experiment question — either
   "yes, the skeleton-overlap class of bug is structurally awkward to write
   here, here's why" or "no, same footguns different syntax, here's the
   SolidJS equivalent trap."

A component library that merely looks nice is not done.

---

## Build setup

- Vite + `vite-plugin-solid`
- No TypeScript (speed > safety for a sandbox)
- No router (single surface)
- No test suite (this is exploratory; the answer to the experiment IS the
  output)
- CSS: plain per-component `.css` files, no preprocessor

```
npm create vite@latest . -- --template solid
```
but we're doing it by hand to keep the scaffold minimal.
