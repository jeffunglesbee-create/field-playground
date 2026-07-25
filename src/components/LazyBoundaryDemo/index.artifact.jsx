import { lazy, createSignal, ErrorBoundary, Show, Suspense } from 'solid-js'
import styles from './LazyBoundaryDemo.module.css'
import shared from '../shared.module.css'
import RealHeavyPanel from './HeavyPanel'

// Artifact variant of LazyBoundaryDemo -- identical behavior and UI to
// index.jsx, only difference is HeavyPanel below uses
// lazy(() => Promise.resolve(...)) instead of lazy(() => import(...)),
// same reasoning as App.artifact.jsx's Seasons. Real index.jsx is
// untouched; this is a parallel file for the artifact build target only.

const HeavyPanel = lazy(() => Promise.resolve({ default: RealHeavyPanel }))

export function LazyBoundaryDemo() {
  const [mounted, setMounted] = createSignal(false)
  const [armed, setArmed] = createSignal(false)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Lazy + Boundary</span>
        <span class={styles.sublabel}>lazy() + ErrorBoundary</span>
      </header>
      <p class={styles.note}>
        Panel is a separate JS chunk. Suspense covers the download.
        ErrorBoundary catches throws inside the loaded panel.
      </p>

      <Show when={!mounted()}>
        <button class={styles.loadBtn} onClick={() => setMounted(true)}>
          load panel (triggers dynamic import)
        </button>
      </Show>

      <Show when={mounted()}>
        <Suspense fallback={
          <div class={styles.loading}>
            <div class={shared.skeleton}>
              <div class={`${shared.bar} ${shared.wide}`} />
              <div class={`${shared.bar} ${shared.medium}`} />
            </div>
            <span class={styles.loadingLabel}>downloading chunk…</span>
          </div>
        }>
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
            <HeavyPanel armed={armed} onArm={() => setArmed(true)} />
          </ErrorBoundary>
        </Suspense>
      </Show>
    </div>
  )
}
