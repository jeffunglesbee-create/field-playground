import { createSignal, createComputed, createEffect, createMemo, For, batch } from 'solid-js'
import styles from './ComputedDemo.module.css'

// createComputed: synchronous during the reactive flush.
//
// The flush order in SolidJS:
//   1. Signal write queues an update batch
//   2. createComputed runs SYNCHRONOUSLY within that batch — before any
//      component re-renders. Derived signals it writes are up-to-date by
//      the time any template evaluates.
//   3. Component rendering happens — the DOM is updated
//   4. createEffect runs — deferred to AFTER rendering completes
//
// Practical implication: if `sorted` is derived from `raw` via createEffect,
// a component reading `sorted()` would render once with the stale sorted list,
// then createEffect fires and updates it, causing a second render. With
// createComputed, `sorted()` is already correct by the first render.
//
// The log below proves the order. Each entry is timestamped to show that
// computed entries always precede effect entries within the same batch.

function formatTime(ts) {
  const d = new Date(ts)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`
}

export function ComputedDemo() {
  const [raw, setRaw] = createSignal([3, 1, 4, 1, 5, 9, 2, 6])
  const [sorted, setSorted] = createSignal([])
  const [log, setLog] = createSignal([])

  let renderCount = 0

  // createComputed fires DURING the flush — sorted is updated before the
  // component re-renders. The component always sees the correct sorted list.
  createComputed(() => {
    const next = [...raw()].sort((a, b) => a - b)
    setSorted(next)
    const ts = performance.now().toFixed(2)
    setLog(l => [...l, { kind: 'computed', msg: `sorted → [${next.join(',')}]`, ts }])
  })

  // createEffect fires AFTER rendering — it would be too late to prevent
  // the component from rendering with a stale sorted list.
  createEffect(() => {
    const _ = raw() // subscribe to same signal
    const ts = performance.now().toFixed(2)
    setLog(l => [...l, { kind: 'effect', msg: `effect saw raw.length=${raw().length}`, ts }])
  })

  // createMemo: also synchronous (lazy — computed on first read, not on signal write)
  // Contrast: createMemo returns a value; createComputed is a side effect
  const sum = createMemo(() => raw().reduce((a, b) => a + b, 0))

  function shuffle() {
    const n = raw().length
    setRaw(Array.from({ length: n }, () => Math.floor(Math.random() * 20)))
  }

  function pushItem() {
    setRaw(r => [...r, Math.floor(Math.random() * 20)])
  }

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Computed</span>
        <span class={styles.sublabel}>createComputed — sync during flush</span>
      </header>
      <p class={styles.note}>
        createComputed fires before render; createEffect fires after.
        Watch log order: computed always precedes effect in the same batch.
      </p>

      <div class={styles.dataRow}>
        <div class={styles.dataBlock}>
          <span class={styles.dataKey}>raw</span>
          <span class={styles.dataVal}>[{raw().join(', ')}]</span>
        </div>
        <div class={styles.dataBlock}>
          <span class={styles.dataKey}>sorted</span>
          <span class={styles.dataVal}>[{sorted().join(', ')}]</span>
        </div>
        <div class={styles.dataBlock}>
          <span class={styles.dataKey}>sum (memo)</span>
          <span class={styles.dataVal}>{sum()}</span>
        </div>
      </div>

      <div class={styles.btnRow}>
        <button class={styles.btn} onClick={shuffle}>shuffle</button>
        <button class={styles.btn} onClick={pushItem}>push item</button>
        <button class={styles.btnClear} onClick={() => setLog([])}>clear log</button>
      </div>

      <div class={styles.log}>
        <For each={log().slice(-12)}>
          {(entry) => (
            <div class={styles.logEntry} data-kind={entry.kind}>
              <span class={styles.logKind}>{entry.kind}</span>
              <span class={styles.logMsg}>{entry.msg}</span>
              <span class={styles.logTs}>{entry.ts}ms</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
