import { For, Show, createSignal, createMemo, createEffect, onMount, onCleanup, ErrorBoundary } from 'solid-js'
import { createRoot } from 'solid-js'
import { deskLastFetchedAt } from '../../data/relay'
import { samples } from '../../data/fetchTiming'
import ReconcileWorker from '../../workers/reconcileWorker.js?worker&inline'
import styles from './HealthPanel.module.css'

// Everything else in this repo that tests a SolidJS mechanism needs a
// human to press a button to prove the point (throw, trigger fail, push
// item). That's fine for a mechanism demo -- the point IS the button.
// It's wrong for a health check: something that only reports status when
// a person happens to click it isn't monitoring anything. This panel
// runs the same underlying tests unattended, on mount, and reports
// PASS/FAIL or a live metric without asking anyone to do anything first.
//
// Deliberately does NOT read CreateRootDemo's or ErrorBoundaryDemo's own
// signals -- those are scoped to a human-driven demo (their counts would
// be confusing to mix with an automated self-test firing independently
// on every mount). Same underlying primitives, separate, unattended
// instances.

function useRootDisposalCheck() {
  const [status, setStatus] = createSignal('checking')
  onMount(() => {
    let disposed = false
    const dispose = createRoot(d => {
      onCleanup(() => { disposed = true })
      return d
    })
    dispose()
    // Cleanup inside createRoot runs synchronously on dispose() -- this
    // isn't racing anything, just confirming it actually happened rather
    // than assuming a call that returned without throwing worked.
    setStatus(disposed ? 'pass' : 'fail')
  })
  return status
}

// This intentionally throws once per mount to verify ErrorBoundary still
// catches it -- Solid logs caught errors to console.error itself in dev
// as a debugging aid (same as ErrorBoundaryDemo's manual "throw" button
// already does), which is expected noise here, not a real failure. The
// check passing means the throw WAS caught; a genuinely uncaught error
// would blank the section instead of reporting 'pass'.
function useErrorBoundaryCheck() {
  const [status, setStatus] = createSignal('checking')
  const [armed, setArmed] = createSignal(true)
  function Bomb() {
    const val = createMemo(() => {
      if (armed()) throw new Error('health-check throw')
      return 'ok'
    })
    return <>{val()}</>
  }
  return {
    status,
    node: (
      <ErrorBoundary fallback={() => { setStatus('pass'); setArmed(false); return null }}>
        <Bomb />
      </ErrorBoundary>
    ),
  }
}

function useWorkerCheck() {
  const [status, setStatus] = createSignal('checking')
  onMount(() => {
    let settled = false
    const worker = new ReconcileWorker()
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; setStatus('fail'); worker.terminate() }
    }, 3000)
    worker.onmessage = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      setStatus('pass')
      worker.terminate()
    }
    worker.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      setStatus('fail')
      worker.terminate()
    }
    // Empty prev/next -- the round trip itself is what's under test, not
    // the diff logic (that's WorkerBridgeDemo's job).
    worker.postMessage({ prev: [], next: [] })
    onCleanup(() => { clearTimeout(timeout); worker.terminate() })
  })
  return status
}

function useFetchHealth() {
  return createMemo(() => {
    const list = samples()
    if (!list.length) return null
    const errors = list.filter(s => !s.ok).length
    const durations = list.map(s => s.durationMs)
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    return { count: list.length, errors, avg, errorRate: errors / list.length }
  })
}

function usePollFreshness() {
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const handle = setInterval(() => setNow(Date.now()), 5000)
    onCleanup(() => clearInterval(handle))
  })
  return createMemo(() => {
    const fetchedAt = deskLastFetchedAt()
    if (!fetchedAt) return null
    // `now` only ticks every 5s, but a poll can resolve in between ticks --
    // clamped to 0 rather than showing a few seconds of a nonsensical
    // negative value until the next tick catches up.
    return Math.max(0, Math.floor((now() - fetchedAt) / 1000))
  })
}

function StatusRow(props) {
  const s = () => props.status()
  const icon = () => (s() === 'pass' ? '✓' : s() === 'fail' ? '✗' : '…')
  return (
    <div class={`${styles.row} ${styles['status_' + s()]}`}>
      <span class={styles.icon}>{icon()}</span>
      <span class={styles.rowLabel}>{props.label}</span>
      <span class={styles.rowDetail}>{props.detail ?? s()}</span>
    </div>
  )
}

export function HealthPanel() {
  const rootStatus = useRootDisposalCheck()
  const errBoundary = useErrorBoundaryCheck()
  const workerStatus = useWorkerCheck()
  const fetchHealth = useFetchHealth()
  const staleness = usePollFreshness()

  const overall = createMemo(() => {
    const checks = [rootStatus(), errBoundary.status(), workerStatus()]
    if (checks.includes('checking')) return 'checking'
    if (checks.includes('fail')) return 'fail'
    if (fetchHealth() && fetchHealth().errorRate > 0.5) return 'fail'
    return 'pass'
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Health Panel</span>
        <span class={`${styles.overallChip} ${styles['overall_' + overall()]}`}>{overall()}</span>
      </header>
      <p class={styles.note}>
        Same primitives as the mechanism demos above, run unattended on mount instead of
        waiting for a button press. A demo needs a human to trigger it; a health check runs itself.
      </p>

      <div class={styles.checkList}>
        <StatusRow status={rootStatus} label="reactive root disposal" />
        <StatusRow status={errBoundary.status} label="error boundary catch" />
        {errBoundary.node}
        <StatusRow status={workerStatus} label="web worker round-trip" />
      </div>

      <div class={styles.metricList}>
        <Show when={fetchHealth()} fallback={<div class={styles.metricRow}><span class={styles.metricLabel}>fetch health</span><span class={styles.metricValue}>no requests yet</span></div>}>
          <div class={styles.metricRow}>
            <span class={styles.metricLabel}>fetch health</span>
            <span class={styles.metricValue}>
              {fetchHealth().count} requests · {fetchHealth().errors} failed · avg {fetchHealth().avg}ms
            </span>
          </div>
        </Show>
        <div class={styles.metricRow}>
          <span class={styles.metricLabel}>poll freshness</span>
          <span class={styles.metricValue}>
            <Show when={staleness() !== null} fallback="no successful poll yet">
              {staleness()}s since last successful poll
            </Show>
          </span>
        </div>
      </div>
    </div>
  )
}
