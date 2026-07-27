import { createSignal, createResource, Suspense, startTransition, Show } from 'solid-js'
import styles from './TransitionDemo.module.css'
import shared from '../shared.module.css'

// startTransition hasn't been tested in this repo at all. Every date
// navigation (DeskCard's shiftDay) is a hard synchronous signal write
// wrapped in batch(). With batch: all subscribers fire synchronously,
// Suspense immediately replaces old content with its fallback while the
// new data loads.
//
// startTransition changes the contract: SolidJS marks the update as
// "deferred" and tells any Suspense boundary in scope NOT to replace its
// current content with the fallback. The old content stays visible until
// the new data arrives, then swaps in one atomic step -- no flash of the
// loading state.
//
// Two things to confirm:
// 1. Does startTransition actually suppress the Suspense fallback?
//    (Answer visible by clicking "with transition" and watching whether
//    the text swaps immediately to "Loading…" or not.)
// 2. Does the signal write itself still propagate reactively through the
//    graph, or does startTransition somehow lose the update?
//    (Answer: the new content DOES eventually appear, proving the signal
//    write went through -- just deferred relative to the Suspense fallback.)
//
// This component's date signal is INDEPENDENT of the shared currentDate
// -- no effect on DeskCard/AmbientPanel/PickEm. Self-contained demo.

const RELAY_BASE = import.meta.env.DEV ? '' : 'https://field-relay-nba.jeffunglesbee.workers.dev'

async function fetchMorningReport(date) {
  const res = await fetch(`${RELAY_BASE}/analytics/newspaper/${date}`)
  if (!res.ok) throw new Error(`newspaper fetch failed: ${res.status}`)
  const json = await res.json()
  return json.morning_report ?? '(no morning report for this date)'
}

function shiftDate(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().split('T')[0]
}

// SuspenseContent is a separate component so that when data() is accessed
// in a tracking scope INSIDE <Suspense>, SolidJS can intercept and suspend.
// Accessing data() at the top level of TransitionDemo (outside <Suspense>)
// wouldn't trigger the suspension mechanism -- it must be inside a child
// component rendered inside the boundary.
function ReportText(props) {
  // A plain `if` here would only check .error ONCE, at this component
  // function's single initial call -- SolidJS components don't re-run on
  // reactive updates, only their returned JSX does. <Show> is what makes
  // the check reactive: it re-evaluates `when` on every update and swaps
  // its rendered branch accordingly, without ever touching props.data()
  // itself in the errored branch. That matters here because once the
  // resource settles into an error, reading props.data() directly would
  // throw and escape past Suspense (which only ever catches PENDING
  // reads, never rejected ones) straight to the outer SafeSection
  // boundary -- confirmed under the artifact's simulated total-fetch-
  // failure. The un-guarded read in the true branch is what lets Suspense
  // still catch it while genuinely pending.
  return (
    <Show when={!props.data.error}>
      <p class={styles.report}>{props.data()}</p>
    </Show>
  )
}

export function TransitionDemo() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = createSignal(today)
  const [data] = createResource(date, fetchMorningReport)

  const [lastMode, setLastMode] = createSignal(null)

  function navigate(delta, mode) {
    const next = shiftDate(date(), delta)
    setLastMode(mode)
    if (mode === 'transition') {
      startTransition(() => setDate(next))
    } else {
      setDate(next)
    }
  }

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Transition</span>
        <span class={styles.date}>{date()}</span>
        <Show when={lastMode()}>
          <span class={styles.modePill} data-mode={lastMode()}>
            last: {lastMode()}
          </span>
        </Show>
      </header>

      <p class={styles.note}>
        "batch" shows Suspense fallback immediately on navigate.
        "transition" keeps old content visible until new data arrives.
      </p>

      <div class={styles.navRow}>
        <button class={styles.navBtn} onClick={() => navigate(-1, 'batch')} title="navigate without startTransition">
          ‹ batch
        </button>
        <button class={`${styles.navBtn} ${styles.navBtnTransition}`} onClick={() => navigate(-1, 'transition')} title="navigate with startTransition">
          ‹ transition
        </button>
        <button class={`${styles.navBtn} ${styles.navBtnTransition}`} onClick={() => navigate(1, 'transition')} title="navigate with startTransition">
          transition ›
        </button>
        <button class={styles.navBtn} onClick={() => navigate(1, 'batch')} title="navigate without startTransition">
          batch ›
        </button>
      </div>

      <Suspense fallback={
        <div class={styles.loading}>
          <div class={shared.skeleton}>
            <div class={`${shared.bar} ${shared.wide}`} />
            <div class={`${shared.bar} ${shared.medium}`} />
          </div>
          <span class={styles.loadingLabel}>Loading… (Suspense fallback showing — this means old content was NOT kept)</span>
        </div>
      }>
        <ReportText data={data} />
      </Suspense>

      <Show when={data.error}>
        <p class={styles.error}>{String(data.error)}</p>
      </Show>
    </div>
  )
}
