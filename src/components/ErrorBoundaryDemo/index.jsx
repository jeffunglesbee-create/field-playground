import { createSignal, createMemo, ErrorBoundary, Show, createResource } from 'solid-js'
import styles from './ErrorBoundaryDemo.module.css'

// Two genuinely different error propagation paths, side by side:
//
// Path A — ErrorBoundary: a synchronous throw inside createMemo propagates
// up through the reactive owner chain to the nearest <ErrorBoundary>. This
// is NOT resource.error. The memo is fine on first run; when shouldThrow()
// becomes true it throws on re-computation; the boundary catches it; reset()
// + clearing the signal brings the memo back to a non-throwing state.
//
// Path B — resource.error: an async resource that rejects sets resource.error
// as a reactive signal, readable via Show when={data.error}. This never
// reaches ErrorBoundary -- it's deliberately captured as state, not as a
// thrown exception. Two different answers to "what do I do with an error."
//
// The question: are these two paths actually separate, or does one subsume
// the other? They're separate. ErrorBoundary catches synchronous throws in
// reactive computation. resource.error is the async equivalent, never thrown
// into the reactive graph, always surfaced as readable state.

const RELAY_BASE = import.meta.env.DEV ? '' : 'https://field-relay-nba.jeffunglesbee.workers.dev'

// Path A: memo that throws when armed
function MaybeBomb(props) {
  const val = createMemo(() => {
    if (props.shouldThrow()) throw new Error('thrown inside createMemo, caught by ErrorBoundary')
    return 'reactive computation is fine'
  })
  return <span class={styles.ok}>✓ {val()}</span>
}

export function ErrorBoundaryDemo() {
  // Path A controls
  const [armed, setArmed] = createSignal(false)

  // Path B: resource that intentionally fails when triggered
  const [triggerFail, setTriggerFail] = createSignal(false)
  const [badData] = createResource(triggerFail, async (shouldFail) => {
    if (!shouldFail) return null
    // Hit a non-existent route — guaranteed 404 in both dev and prod
    const res = await fetch(`${RELAY_BASE}/this/route/does/not/exist`)
    if (!res.ok) throw new Error(`resource rejected: ${res.status}`)
    return res.json()
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Error Boundary</span>
      </header>

      <section class={styles.section}>
        <h3 class={styles.sectionLabel}>Path A — sync throw → ErrorBoundary</h3>
        <p class={styles.note}>createMemo throws when armed; boundary catches and resets</p>
        <ErrorBoundary
          fallback={(err, reset) => (
            <div class={styles.caught}>
              <span class={styles.caughtIcon}>⚠</span>
              <span class={styles.caughtMsg}>{err.message}</span>
              <button
                class={styles.resetBtn}
                onClick={() => { setArmed(false); reset() }}
              >
                reset
              </button>
            </div>
          )}
        >
          <MaybeBomb shouldThrow={armed} />
        </ErrorBoundary>
        <Show when={!armed()}>
          <button class={styles.armBtn} onClick={() => setArmed(true)}>throw</button>
        </Show>
      </section>

      <section class={styles.section}>
        <h3 class={styles.sectionLabel}>Path B — async rejection → resource.error</h3>
        <p class={styles.note}>resource rejects; error surfaces as readable state, not a thrown exception</p>
        <Show when={!triggerFail()}>
          <button class={styles.armBtn} onClick={() => setTriggerFail(true)}>trigger fail</button>
        </Show>
        <Show when={badData.error}>
          <div class={styles.resourceError}>
            <span class={styles.caughtIcon}>✗</span>
            <span class={styles.caughtMsg}>{String(badData.error)}</span>
            <button
              class={styles.resetBtn}
              onClick={() => setTriggerFail(false)}
            >
              clear
            </button>
          </div>
        </Show>
        <Show when={!badData.error && !triggerFail()}>
          <span class={styles.ok}>✓ no resource error</span>
        </Show>
      </section>
    </div>
  )
}
