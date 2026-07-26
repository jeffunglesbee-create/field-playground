import { For, Show, createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { currentDate } from '../../data/relay'
import { peers, presenceEvents, myTabId } from '../../data/presence'
import styles from './Presence.module.css'

// "How many tabs have this date open right now" has no server to ask.
// relay.js already has a BroadcastChannel for date-sync, but that only
// proves a signal write in one tab reaches another -- it doesn't answer
// "which tabs exist at all, right now." That needs a real protocol:
// join when a tab opens, heartbeat while it's alive, leave when it
// closes cleanly, and a timeout for when it doesn't (crash, force-quit).

function relativeLabel(at, now) {
  const s = Math.max(0, Math.floor((now - at) / 1000))
  return s < 1 ? 'now' : `${s}s ago`
}

export function Presence() {
  const [now, setNow] = createSignal(Date.now())

  onMount(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(handle))
  })

  const peerList = createMemo(() => Object.entries(peers).map(([id, p]) => ({ id, ...p })))
  const onThisDate = createMemo(() => peerList().filter(p => p.date === currentDate()).length + 1) // +1 = self
  const elsewhere = createMemo(() => peerList().filter(p => p.date !== currentDate()).length)
  const ordered = createMemo(() => [...presenceEvents()].reverse())

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Presence</span>
        <span class={styles.sublabel}>BroadcastChannel join/heartbeat/leave, zero server</span>
      </header>

      <div class={styles.countRow}>
        <span class={styles.bigCount}>{onThisDate()}</span>
        <span class={styles.countLabel}>tab{onThisDate() === 1 ? '' : 's'} viewing {currentDate()}</span>
      </div>
      <Show when={elsewhere() > 0}>
        <p class={styles.note}>{elsewhere()} other tab{elsewhere() === 1 ? '' : 's'} open on a different date.</p>
      </Show>
      <p class={styles.selfRow}>this tab: <span class={styles.idChip}>{myTabId}</span></p>

      <Show when={presenceEvents().length} fallback={<p class={styles.empty}>No protocol events yet.</p>}>
        <div class={styles.log}>
          <For each={ordered().slice(0, 20)}>
            {e => (
              <div class={`${styles.eventRow} ${styles['kind_' + e.kind]}`}>
                <span class={styles.eventKind}>{e.kind}</span>
                <span class={styles.eventId}>{e.id}{e.id === myTabId ? ' (self)' : ''}</span>
                <Show when={e.date}><span class={styles.eventDate}>{e.date}</span></Show>
                <span class={styles.eventTime}>{relativeLabel(e.at, now())}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
