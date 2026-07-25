import { createSignal, For } from 'solid-js'
import { Portal } from 'solid-js/web'
import styles from './Toast.module.css'

// Global toast layer. First use of <Portal> in this repo -- renders its
// children into a DOM node OUTSIDE wherever this component is mounted
// (document.body by default), which is the actual point: a toast
// triggered by a deeply-nested GameRow shouldn't need to know or care
// where in the tree it's rendered, and shouldn't be clipped by any
// ancestor's overflow:hidden (several containers in this repo have it).

let idCounter = 0
const [toasts, setToasts] = createSignal([])

export function showToast(message, kind = 'info') {
  const id = idCounter++
  setToasts(t => [...t, { id, message, kind }])
  setTimeout(() => {
    setToasts(t => t.filter(x => x.id !== id))
  }, 5000)
}

export function ToastLayer() {
  return (
    <Portal>
      <div class={styles.layer}>
        <For each={toasts()}>
          {t => <div class={`${styles.toast} ${styles[t.kind]}`}>{t.message}</div>}
        </For>
      </div>
    </Portal>
  )
}
