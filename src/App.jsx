import { onMount, onCleanup, lazy, Suspense } from 'solid-js'
import { AmbientPanel } from './components/AmbientPanel'
import { DeskCard } from './components/DeskCard'
import { PickEm } from './components/PickEm'
import { Ground } from './components/Ground'
import { DayComparison } from './components/DayComparison'
import { SuspenseDemo } from './components/SuspenseDemo'
import { Agreement } from './components/Agreement'
import { CrossCheck } from './components/CrossCheck'
import { CreateRootDemo } from './components/CreateRootDemo'
import { ToastLayer } from './components/Toast'
import { refetchDesk, initUrlDateSync, initBroadcastDateSync } from './data/relay'
import shared from './components/shared.module.css'
import styles from './App.module.css'

// Live reconciliation experiment (docs/EXPERIMENT-live-reconciliation.md):
// poll the same fetcher on an interval, without touching currentDate, so
// DeskCard sees real score/status updates over time instead of only once
// at initial load. 15s matches the "good citizen" cadence already noted
// for this relay elsewhere in this project -- roughly the real client's
// own polling interval, not tighter.
const POLL_INTERVAL_MS = 15000

// lazy(): first code-splitting test in this repo. Seasons is a
// reasonable candidate -- it's one of the larger components (tabs for
// MLB/MLS/World Cup, real relay calls) and isn't needed for the
// above-the-fold content. The actual questions: does <Suspense>'s
// fallback show while the chunk itself is loading (a genuinely
// different moment than "the resource inside it is loading," which is
// what every other Suspense/skeleton pattern here has tested), and does
// Vite's dev-mode HMR still work correctly on a lazy-loaded component
// during local iteration.
const Seasons = lazy(() => import('./components/Seasons').then(m => ({ default: m.Seasons })))

export default function App() {
  onMount(() => {
    const handle = setInterval(() => { refetchDesk() }, POLL_INTERVAL_MS)
    onCleanup(() => clearInterval(handle))
    initUrlDateSync()
    initBroadcastDateSync()
  })

  return (
    <div class={styles.layout}>
      <section class={styles.ambient}>
        <AmbientPanel />
      </section>
      <section class={styles.desk}>
        <DeskCard />
      </section>
      <section class={styles.pickem}>
        <PickEm />
      </section>
      <section class={styles.seasons}>
        <Suspense fallback={<div class={shared.skeleton}><div class={`${shared.bar} ${shared.wide}`} /><div class={`${shared.bar} ${shared.medium}`} /></div>}>
          <Seasons />
        </Suspense>
      </section>
      <section class={styles.ground}>
        <Ground />
      </section>
      <section class={styles.dayComparison}>
        <DayComparison />
      </section>
      <section class={styles.suspenseDemo}>
        <SuspenseDemo />
      </section>
      <section class={styles.agreement}>
        <Agreement />
      </section>
      <section class={styles.crossCheck}>
        <CrossCheck />
      </section>
      <section class={styles.createRootDemo}>
        <CreateRootDemo />
      </section>
      <ToastLayer />
    </div>
  )
}
