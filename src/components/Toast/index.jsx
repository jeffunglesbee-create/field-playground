import { createSignal, createRoot, For } from 'solid-js'
import { Portal } from 'solid-js/web'
import styles from './Toast.module.css'

// Global toast layer. <Portal> renders outside wherever this component
// is mounted, avoiding clipping by any ancestor's overflow:hidden.
//
// createRoot disposal test (2026-07-25): each toast gets its OWN
// detached reactive root, not just relying on <For>'s automatic cleanup
// when an item leaves the array. The root owns a countdown signal
// (drives the shrinking progress bar) and is explicitly disposed on
// dismiss -- whether by timeout or a manual close click. rootStats
// below is real instrumentation, not a comment claiming this works:
// created and disposed should always converge to the same number once
// every toast currently on screen has dismissed. If disposed lags
// created permanently, that's a real leak, not a hypothetical one.

let idCounter = 0
const [toasts, setToasts] = createSignal([])

export const rootStats = { created: 0, disposed: 0 }

const DURATION_MS = 5000

export function showToast(message, kind = 'info') {
  const id = idCounter++

  createRoot(dispose => {
    rootStats.created++
    const [remaining, setRemaining] = createSignal(DURATION_MS)
    const startedAt = Date.now()

    const dismiss = () => {
      clearInterval(interval)
      setToasts(t => t.filter(x => x.id !== id))
      dispose()
      rootStats.disposed++
    }

    const interval = setInterval(() => {
      const left = Math.max(0, DURATION_MS - (Date.now() - startedAt))
      setRemaining(left)
      if (left <= 0) dismiss()
    }, 100)

    setToasts(t => [...t, { id, message, kind, remaining, dismiss }])
  })
}

export function ToastLayer() {
  return (
    <Portal>
      <div class={styles.layer}>
        <For each={toasts()}>
          {t => (
            <div class={`${styles.toast} ${styles[t.kind]}`} onClick={t.dismiss}>
              <span>{t.message}</span>
              <div class={styles.progressTrack}>
                <div class={styles.progressFill} style={{ width: `${(t.remaining() / DURATION_MS) * 100}%` }} />
              </div>
            </div>
          )}
        </For>
      </div>
    </Portal>
  )
}
