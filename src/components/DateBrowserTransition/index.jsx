import { createSignal, createResource, Suspense, startTransition, Show } from 'solid-js'
import { currentDate, setCurrentDate } from '../../data/relay'
import styles from './DateBrowserTransition.module.css'
import shared from '../shared.module.css'

// startTransition against the real shared currentDate.
//
// This is the integration complement to TransitionDemo (which uses an
// independent signal). Here the signal IS the app's shared currentDate —
// the same one driving DeskCard, AmbientPanel, and PickEm. Navigating here
// changes the date globally.
//
// The Suspense boundary below wraps a resource that reads currentDate().
// With startTransition: the deferred update tells Suspense not to replace
// current content with the fallback. Old headline stays visible until the
// new fetch resolves.
// Without (plain setCurrentDate): Suspense immediately swaps to skeleton.
//
// Confirming two things:
// 1. startTransition defers the Suspense boundary reaction — fallback is
//    suppressed even though the resource is re-fetching.
// 2. The shared signal update still propagates to all consumers (DeskCard
//    etc. see the new date), but those consumers' Suspense boundaries (if
//    any) receive the same deferral treatment.

const RELAY_BASE = import.meta.env.DEV ? '' : 'https://field-relay-nba.jeffunglesbee.workers.dev'

async function fetchHeadline(date) {
  const res = await fetch(`${RELAY_BASE}/analytics/newspaper/${date}`)
  if (!res.ok) throw new Error(`headline fetch failed: ${res.status}`)
  const json = await res.json()
  const top = json?.pick?.ranked?.[0]
  return top
    ? `${top.away} @ ${top.home} (${top.sport}, tier ${top.tier})`
    : json?.morning_report?.slice(0, 120) ?? '(no content for this date)'
}

function shiftDate(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().split('T')[0]
}

function HeadlineText(props) {
  return <p class={styles.headline}>{props.data()}</p>
}

export function DateBrowserTransition() {
  const [lastMode, setLastMode] = createSignal(null)
  // Resource reads the SHARED currentDate signal
  const [data] = createResource(currentDate, fetchHeadline)

  function navigate(delta, mode) {
    const next = shiftDate(currentDate(), delta)
    setLastMode(mode)
    if (mode === 'transition') {
      startTransition(() => setCurrentDate(next))
    } else {
      setCurrentDate(next)
    }
  }

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Date Transition</span>
        <span class={styles.sublabel}>startTransition — shared currentDate</span>
      </header>
      <p class={styles.warning}>
        ⚠ navigating here changes the app-wide date (DeskCard, Ambient, PickEm update too)
      </p>
      <div class={styles.dateRow}>
        <span class={styles.dateVal}>{currentDate()}</span>
        <Show when={lastMode()}>
          <span class={styles.modePill} data-mode={lastMode()}>
            {lastMode()}
          </span>
        </Show>
      </div>

      <div class={styles.navRow}>
        <button class={styles.navBtn} onClick={() => navigate(-1, 'batch')} title="plain setCurrentDate">
          ‹ batch
        </button>
        <button class={`${styles.navBtn} ${styles.navBtnT}`} onClick={() => navigate(-1, 'transition')} title="startTransition">
          ‹ transition
        </button>
        <button class={`${styles.navBtn} ${styles.navBtnT}`} onClick={() => navigate(1, 'transition')} title="startTransition">
          transition ›
        </button>
        <button class={styles.navBtn} onClick={() => navigate(1, 'batch')} title="plain setCurrentDate">
          batch ›
        </button>
      </div>

      <Suspense fallback={
        <div class={styles.loading}>
          <div class={shared.skeleton}>
            <div class={`${shared.bar} ${shared.wide}`} />
          </div>
          <span class={styles.loadingLabel}>Suspense fallback — old content was NOT kept</span>
        </div>
      }>
        <HeadlineText data={data} />
      </Suspense>

      <Show when={data.error}>
        <p class={styles.error}>{String(data.error)}</p>
      </Show>
    </div>
  )
}
