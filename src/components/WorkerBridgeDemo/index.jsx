import { For, Show, createSignal, createEffect, onMount, onCleanup } from 'solid-js'
import { deskStore, deskLastFetchedAt } from '../../data/relay'
// `?worker&inline` bundles the worker as a base64 data URL instead of a
// separate chunk file -- required for the standalone single-file artifact
// build, which has no server behind it to serve a second network request
// for a plain `new Worker(new URL(...))` chunk. Works identically in the
// normal chunked build too, just without the (here, unneeded) separate
// network round-trip.
import ReconcileWorker from '../../workers/reconcileWorker.js?worker&inline'
import styles from './WorkerBridgeDemo.module.css'

// Question: can SolidJS's reactive graph be driven from outside the main
// thread without breaking fine-grained updates? Every prior cross-context
// write in this repo (BroadcastChannel, the highlightedGameId cross-tree
// signal) still runs on the main thread, just outside the component
// that owns the signal. A Web Worker is a genuinely different execution
// context -- no shared memory, no access to Solid's reactive runtime at
// all on the worker side. The only channel back is postMessage, and the
// only thing that has to happen correctly is the plain `setDiff(data)`
// call in the onmessage handler -- Solid doesn't need to know or care
// that the write originated off-thread; a signal setter is just a
// function, and this is still a normal call to it.
//
// Deliberately does NOT touch deskStore/relay.js's own reconciliation
// (that's real, production-shaped code) -- this keeps its own snapshot
// of the games array and diffs a COPY off-thread, purely to exercise
// the worker-to-signal bridge as an independent, additive pattern.

export function WorkerBridgeDemo() {
  const [diff, setDiff] = createSignal(null)
  const [pollCount, setPollCount] = createSignal(0)
  let worker
  // Cloned to plain objects at capture time, not just at postMessage time
  // -- deskStore's reconcile() patches existing game objects IN PLACE
  // when possible (that's the whole point of the live-reconciliation
  // experiment: stable references for DOM/perf). Keeping `lastSnapshot`
  // pointed at the live store objects means the next reconcile() mutates
  // the "previous" snapshot retroactively, so prev and next end up
  // identical and the diff misses the transition entirely. Cloning once,
  // right when each snapshot is captured, is what actually freezes it.
  let lastSnapshot = []
  let seeded = false
  let lastDate = null

  onMount(() => {
    worker = new ReconcileWorker()
    worker.onmessage = (e) => setDiff(e.data)
    onCleanup(() => worker.terminate())
  })

  createEffect(() => {
    // Guards against the same bug class the diff itself is meant to
    // avoid: reading null here means no poll has resolved yet, and
    // returning early keeps `seeded` false so the FIRST REAL poll
    // becomes the baseline instead of getting diffed against an empty
    // lastSnapshot (which would report every game on the slate as
    // "added" on that first real cycle).
    if (deskLastFetchedAt() == null) return
    if (!worker) return

    // Same reseed-on-date-change as PollDeltaFeed: DeskCard's date
    // browser swaps the whole slate for a different date's games, which
    // isn't a real transition of any of these games.
    if (deskStore.date !== lastDate) {
      lastDate = deskStore.date
      seeded = false
    }

    const snapshot = [
      ...(deskStore.games?.regular ?? []),
      ...(deskStore.games?.postseason ?? []),
    ].map(g => ({ ...g }))

    if (!seeded) {
      seeded = true
      lastSnapshot = snapshot
      return
    }
    setPollCount(c => c + 1)
    // Structured-clone-safe plain objects only -- postMessage can't carry
    // Solid's store proxies, but both sides are already cloned above.
    worker.postMessage({ prev: lastSnapshot, next: snapshot })
    lastSnapshot = snapshot
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Worker Bridge</span>
        <span class={styles.sublabel}>reconcile diff computed off-thread</span>
      </header>
      <p class={styles.note}>
        Each poll cycle sends the previous and current game snapshots to a real Web Worker.
        The diff comes back via postMessage into a plain createSignal — polls seen: {pollCount()}.
      </p>
      <Show when={diff()} fallback={<p class={styles.empty}>Waiting for the first poll cycle…</p>}>
        <div class={styles.statsRow}>
          <span class={styles.stat}>{diff().prevCount} → {diff().nextCount} games</span>
          <span class={styles.stat}>computed in {diff().computeMs}ms (off-thread)</span>
        </div>
        <Show when={diff().changes.length} fallback={<p class={styles.empty}>No changes this cycle.</p>}>
          <div class={styles.changeList}>
            <For each={diff().changes}>
              {c => (
                <div class={`${styles.changeRow} ${styles['type_' + c.type]}`}>
                  <span class={styles.changeType}>{c.type}</span>
                  <span class={styles.changeLabel}>{c.label}</span>
                  <Show when={c.type === 'score'}>
                    <span class={styles.changeDetail}>{c.from} → {c.to}</span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}
