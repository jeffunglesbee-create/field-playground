import { createSignal, ErrorBoundary, Show, Suspense } from 'solid-js'
import { HeavyPanelLazy as HeavyPanel } from '../../lazyModules'
import styles from './LazyBoundaryDemo.module.css'
import shared from '../shared.module.css'

// lazy() + ErrorBoundary: two distinct mechanisms that compose naturally.
//
// lazy(): code-splits HeavyPanel into a separate chunk. On first render
// the dynamic import fires; <Suspense> shows the skeleton fallback until
// the chunk resolves. After that, the chunk is cached — re-mounting
// HeavyPanel does NOT re-download it.
//
// ErrorBoundary: wraps the lazy component so that sync throws inside it
// (here, a createMemo throw) are caught at this boundary rather than
// propagating up. reset() + signal clear brings the panel back to a clean
// state without re-downloading the chunk.
//
// The two mechanisms are independent:
//   Suspense handles the async load-time behavior
//   ErrorBoundary handles the sync runtime-error behavior
// They compose because lazy() returns a component that suspends on first
// render (Suspense picks it up), but once loaded, it behaves like a normal
// component (ErrorBoundary picks up throws inside it).

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
