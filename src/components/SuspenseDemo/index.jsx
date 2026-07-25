import { Suspense, For, Show, createResource } from 'solid-js'
import { currentDate } from '../../data/relay'
import styles from './SuspenseDemo.module.css'
import shared from '../shared.module.css'

const RELAY_BASE = import.meta.env.DEV
  ? ''
  : 'https://field-relay-nba.jeffunglesbee.workers.dev'

// Independent resources, not the main app's ambientData/deskData -- by
// the time this section renders, those are almost always already
// resolved (they load first, at the top of the page), so there'd be no
// loading state left to actually observe Suspense coordinating. Fresh
// fetches here means a real, own loading window to test against.
async function fetchNewsMini(date) {
  const res = await fetch(`${RELAY_BASE}/analytics/newspaper/${date}`)
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  return res.json()
}
async function fetchDeskMini(date) {
  const res = await fetch(`${RELAY_BASE}/context/date/${date}`)
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  return res.json()
}

function NewsMini() {
  // Reading the resource by calling it (news()) is what lets <Suspense>
  // catch this specific read while unresolved -- unlike every other
  // component here, this one does NOT guard with <Show when={news()}>
  // first. That guard is exactly what would prevent Suspense from ever
  // seeing an unresolved read in the first place.
  const [news] = createResource(currentDate, fetchNewsMini)
  return (
    <div class={styles.pane}>
      <div class={styles.paneLabel}>Ambient (mini)</div>
      <p class={styles.snippet}>{news()?.morning_report?.slice(0, 120)}…</p>
    </div>
  )
}

function DeskMini() {
  const [desk] = createResource(currentDate, fetchDeskMini)
  const games = () => [...(desk()?.games?.regular ?? [])].slice(0, 4)
  return (
    <div class={styles.pane}>
      <div class={styles.paneLabel}>Desk (mini)</div>
      <For each={games()}>
        {g => <div class={styles.row}>{g.away} @ {g.home}</div>}
      </For>
    </div>
  )
}

function CoordinatedSkeleton() {
  return (
    <div class={shared.skeleton}>
      <div class={`${shared.bar} ${shared.wide}`} />
      <div class={`${shared.bar} ${shared.medium}`} />
      <div class={`${shared.bar} ${shared.wide}`} />
    </div>
  )
}

// The actual experiment: ONE <Suspense> boundary around both mini-panes.
// Neither NewsMini nor DeskMini renders its own fallback -- Suspense
// shows one shared skeleton until BOTH resources have resolved, then
// reveals both simultaneously. Compare against AmbientPanel/DeskCard
// above, which each manage their own Show-based skeleton independently
// and reveal whenever THEY individually finish (staggered).
export function SuspenseDemo() {
  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Suspense Coordination</span>
        <span class={styles.note}>one shared skeleton, not two independent ones</span>
      </header>
      <Suspense fallback={<CoordinatedSkeleton />}>
        <div class={styles.panes}>
          <NewsMini />
          <DeskMini />
        </div>
      </Suspense>
    </div>
  )
}
