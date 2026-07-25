import { createMemo, Show } from 'solid-js'
import styles from './LazyBoundaryDemo.module.css'

// This module is lazy-loaded — it's a separate chunk in the build.
// Vite splits it because the parent imports it via lazy(() => import('./HeavyPanel')).
// The <Suspense> boundary in the parent shows a skeleton while this chunk downloads.
//
// Once loaded, an ErrorBoundary wraps this component so throws here don't
// surface to the resource level or crash the parent. This is "lazy + boundary"
// composing naturally: load asynchronously, fail safely.

export default function HeavyPanel(props) {
  const value = createMemo(() => {
    if (props.armed()) throw new Error('HeavyPanel: createMemo threw (armed)')
    return 'panel loaded — reactive computation healthy'
  })

  return (
    <div class={styles.panel}>
      <div class={styles.panelRow}>
        <span class={styles.panelIcon}>✓</span>
        <span class={styles.panelMsg}>{value()}</span>
      </div>
      <Show when={!props.armed()}>
        <button class={styles.throwBtn} onClick={props.onArm}>
          throw inside panel
        </button>
      </Show>
    </div>
  )
}
