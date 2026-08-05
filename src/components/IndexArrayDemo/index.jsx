import { indexArray, mapArray, createSignal, For, onMount, onCleanup, createMemo } from 'solid-js'
import styles from './IndexArrayDemo.module.css'

// indexArray vs mapArray: position-keyed vs identity-keyed list reconciliation.
//
// mapArray (the primitive behind <For>): keyed by item identity (reference
//   equality). When the same object reference appears at a different position,
//   mapArray moves the rendered output. When a new object (different reference)
//   appears at a position, mapArray unmounts the old and mounts the new.
//   Callback: (item, index) where item is the value (stable reference), index
//   is a reactive Signal<number>.
//
// indexArray (the primitive behind <Index>): keyed by position. Slot 0 is
//   always "slot 0" regardless of what value occupies it. When the value at
//   position 0 changes, the slot receives the new value via a reactive Signal.
//   The slot component never unmounts/remounts — it updates in place.
//   Callback: (item, index) where item is a Signal<T> (reactive getter),
//   index is a plain number (stable per position).
//
// Rolling window: a fixed-size buffer where positions are stable but values
// rotate. Each push (`prev.slice(1)` + one new event) reuses the same object
// references for the 4 surviving items and adds exactly ONE new object at
// the tail. indexArray sees 5 value updates to existing stable slots every
// push, never a remount. mapArray unmounts+remounts exactly the ONE slot
// that receives the new identity (the tail) on every push; the other 4
// slots keep their existing component instance and just shift their
// reactive index down.
//
// Per-slot mount counts prove only that each individual live instance
// mounted once -- true but static, and can't show growth: a local
// createSignal(0) is reset to a fresh 0->1 on every remount, and a bucket
// keyed by "position at mount time" doesn't work either here, since every
// new mount happens at the SAME tail position, so multiple still-alive
// survivor slots would end up sharing (and appearing to jointly grow
// alongside) that one bucket even though they personally never remounted
// -- a different, more confusing wrongness. What actually proves the claim
// is a running TOTAL per column, incremented once per mount event from
// the parent (which outlives every slot): indexArray's total stops at 5
// (the initial mount) and never moves again; mapArray's total keeps
// climbing by 1 every push, forever.

const WINDOW_SIZE = 5

let eventCounter = 0

function makeEvent() {
  eventCounter++
  const teams = ['LAL', 'BOS', 'GSW', 'MIA', 'MIL', 'PHX', 'DEN', 'DAL']
  const a = teams[Math.floor(Math.random() * teams.length)]
  let b = a
  while (b === a) b = teams[Math.floor(Math.random() * teams.length)]
  const score = `${Math.floor(Math.random() * 40 + 80)}-${Math.floor(Math.random() * 40 + 80)}`
  return { id: eventCounter, text: `${a} v ${b} ${score}` }
}

const INITIAL = Array.from({ length: WINDOW_SIZE }, makeEvent)

export function IndexArrayDemo() {
  const [events, setEvents] = createSignal(INITIAL)

  // Running totals live here, in the parent -- outliving every slot, so
  // they can actually accumulate across remounts instead of resetting.
  const [indexMountTotal, setIndexMountTotal] = createSignal(0)
  const [mapMountTotal, setMapMountTotal] = createSignal(0)
  const bumpIndexMount = () => setIndexMountTotal(c => c + 1)
  const bumpMapMount = () => setMapMountTotal(c => c + 1)

  function push() {
    setEvents(prev => [...prev.slice(1), makeEvent()])
  }

  // Direct use of indexArray — position-keyed
  const indexMapped = indexArray(events, (item, index) => ({
    type: 'index',
    index,
    item,   // item is a Signal<{id, text}>
  }))

  // Direct use of mapArray — identity-keyed
  const forMapped = mapArray(events, (item, index) => ({
    type: 'map',
    index,  // index is a Signal<number>
    item,   // item is the value directly (stable reference while it exists)
  }))

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Index Array</span>
        <span class={styles.sublabel}>indexArray vs mapArray</span>
      </header>
      <p class={styles.note}>
        Rolling window of {WINDOW_SIZE} events. Each push shifts values left, discards oldest.
        indexArray slot stays alive; mapArray slot unmounts/remounts on identity change.
        Column mount totals prove it — indexArray total stops at {WINDOW_SIZE}; mapArray total keeps climbing.
      </p>

      <button class={styles.pushBtn} onClick={push}>push new event</button>

      <div class={styles.columns}>
        <div class={styles.column}>
          <div class={styles.colLabel}>indexArray (position-keyed) — total mounts: {indexMountTotal()}</div>
          <For each={indexMapped()}>
            {(mapped) => <IndexSlot mapped={mapped} onSlotMount={bumpIndexMount} />}
          </For>
        </div>
        <div class={styles.column}>
          <div class={styles.colLabel}>mapArray (identity-keyed) — total mounts: {mapMountTotal()}</div>
          <For each={forMapped()}>
            {(mapped) => <MapSlot mapped={mapped} onSlotMount={bumpMapMount} />}
          </For>
        </div>
      </div>
    </div>
  )
}

// indexArray slot: item is a Signal — reads item() to get current value.
// This component instance is REUSED across pushes for its position, so it
// mounts exactly once, ever, and reports that one mount to the parent's
// running total.
function IndexSlot(props) {
  const [mountCount, setMountCount] = createSignal(0)
  onMount(() => { setMountCount(c => c + 1); props.onSlotMount() })

  return (
    <div class={styles.slot}>
      <span class={styles.slotPos}>pos {props.mapped.index}</span>
      <span class={styles.slotText}>{props.mapped.item().text}</span>
      <span class={styles.slotMount} title="this instance's own mount count">×{mountCount()}</span>
    </div>
  )
}

// mapArray slot: item is a stable value (not a signal). This component
// unmounts when its identity leaves the list and a fresh instance mounts
// in its place — each fresh instance also reports its mount to the
// parent's running total, which is what actually accumulates across the
// unmount/remount cycles this per-instance signal cannot see past.
function MapSlot(props) {
  const [mountCount, setMountCount] = createSignal(0)
  onMount(() => { setMountCount(c => c + 1); props.onSlotMount() })

  // index() gives the current position — a Signal in mapArray
  return (
    <div class={styles.slot}>
      <span class={styles.slotPos}>pos {props.mapped.index()}</span>
      <span class={styles.slotText}>{props.mapped.item.text}</span>
      <span class={styles.slotMount} title="this instance's own mount count">×{mountCount()}</span>
    </div>
  )
}
