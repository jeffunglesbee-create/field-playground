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
// rotate. Every push creates a new object at every position — mapArray sees
// N removals + N additions each time. indexArray sees N value updates to
// existing stable slots. Mount counts prove it:
//   indexArray slots: mount count stays at 1 regardless of how many pushes
//   mapArray slots: mount count increments on every push

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
        Mount count proves it — indexArray stays at 1; mapArray grows.
      </p>

      <button class={styles.pushBtn} onClick={push}>push new event</button>

      <div class={styles.columns}>
        <div class={styles.column}>
          <div class={styles.colLabel}>indexArray (position-keyed)</div>
          <For each={indexMapped()}>
            {(mapped) => <IndexSlot mapped={mapped} />}
          </For>
        </div>
        <div class={styles.column}>
          <div class={styles.colLabel}>mapArray (identity-keyed)</div>
          <For each={forMapped()}>
            {(mapped) => <MapSlot mapped={mapped} />}
          </For>
        </div>
      </div>
    </div>
  )
}

// indexArray slot: item is a Signal — reads item() to get current value.
// This component instance is REUSED across pushes for its position.
function IndexSlot(props) {
  const [mountCount, setMountCount] = createSignal(0)
  onMount(() => setMountCount(c => c + 1))

  return (
    <div class={styles.slot}>
      <span class={styles.slotPos}>pos {props.mapped.index}</span>
      <span class={styles.slotText}>{props.mapped.item().text}</span>
      <span class={styles.slotMount} title="mount count">×{mountCount()}</span>
    </div>
  )
}

// mapArray slot: item is a stable value (not a signal). This component
// unmounts when its identity leaves the list.
function MapSlot(props) {
  const [mountCount, setMountCount] = createSignal(0)
  onMount(() => setMountCount(c => c + 1))

  // index() gives the current position — a Signal in mapArray
  return (
    <div class={styles.slot}>
      <span class={styles.slotPos}>pos {props.mapped.index()}</span>
      <span class={styles.slotText}>{props.mapped.item.text}</span>
      <span class={styles.slotMount} title="mount count">×{mountCount()}</span>
    </div>
  )
}
