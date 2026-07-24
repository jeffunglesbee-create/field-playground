import { onMount, onCleanup } from 'solid-js'
import { AmbientPanel } from './components/AmbientPanel'
import { DeskCard } from './components/DeskCard'
import { refetchDesk } from './data/relay'
import styles from './App.module.css'

// Live reconciliation experiment (docs/EXPERIMENT-live-reconciliation.md):
// poll the same fetcher on an interval, without touching currentDate, so
// DeskCard sees real score/status updates over time instead of only once
// at initial load. 15s matches the "good citizen" cadence already noted
// for this relay elsewhere in this project -- roughly the real client's
// own polling interval, not tighter.
const POLL_INTERVAL_MS = 15000

export default function App() {
  onMount(() => {
    const handle = setInterval(() => { refetchDesk() }, POLL_INTERVAL_MS)
    onCleanup(() => clearInterval(handle))
  })

  return (
    <div class={styles.layout}>
      <section class={styles.ambient}>
        <AmbientPanel />
      </section>
      <section class={styles.desk}>
        <DeskCard />
      </section>
    </div>
  )
}
