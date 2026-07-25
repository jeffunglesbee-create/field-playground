import { createRoot, createSignal, For, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import styles from './CreateRootDemo.module.css'

// Explicit createRoot lifecycle test -- the main app's ToastLayer uses a
// single shared root (App's own render tree) with a <For> over an
// array, which is the normal, idiomatic pattern. This is deliberately
// different: EACH toast here gets its OWN detached createRoot, outside
// any component tree, specifically to test disposal. createRoot returns
// a dispose function; the real question is whether calling it on
// auto-dismiss actually tears the root down, or whether something leaks.
//
// Instrumentation: a live count of un-disposed roots, tracked directly,
// not inferred. If disposal worked, the count returns to 0 after every
// toast's own lifetime. If it leaked, the count would climb and never
// come back down -- visible directly, not assumed from the absence of
// an error.

let liveRootCount = 0
const [liveRoots, setLiveRoots] = createSignal(0)
const [disposedTotal, setDisposedTotal] = createSignal(0)

function fireDetachedToast(message) {
  let disposeRoot
  const container = document.createElement('div')
  document.body.appendChild(container)

  disposeRoot = createRoot(dispose => {
    const [visible, setVisible] = createSignal(true)
    liveRootCount++
    setLiveRoots(liveRootCount)

    onCleanup(() => {
      // Confirms the root's own cleanup machinery actually runs on
      // dispose -- if this never fires, dispose() itself is broken,
      // not just failing to remove the DOM node.
      liveRootCount--
      setLiveRoots(liveRootCount)
      setDisposedTotal(t => t + 1)
    })

    // Minimal render into the detached container -- Portal isn't
    // needed here since this root IS its own tree already, separate
    // from the app's.
    const el = document.createElement('div')
    el.className = styles.detachedToast
    el.textContent = message
    container.appendChild(el)

    setTimeout(() => {
      container.remove()
      dispose() // <-- the actual thing under test
    }, 2500)

    return dispose
  })
}

export function CreateRootDemo() {
  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>createRoot Disposal</span>
      </header>
      <p class={styles.note}>
        Each fire creates a fully detached reactive root (not the app's
        shared ToastLayer). Live count should always return to 0 within
        ~2.5s of the last fire — if it climbs and stays up, disposal
        leaked.
      </p>
      <div class={styles.stats}>
        <span class={styles.stat}>live roots: <strong class={liveRoots() > 0 ? styles.statActive : ''}>{liveRoots()}</strong></span>
        <span class={styles.stat}>disposed total: <strong>{disposedTotal()}</strong></span>
      </div>
      <button
        class={styles.fireBtn}
        onClick={() => fireDetachedToast(`Detached toast #${disposedTotal() + liveRoots() + 1}`)}
      >
        fire detached toast
      </button>
    </div>
  )
}
