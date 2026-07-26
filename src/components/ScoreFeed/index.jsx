import { For, Show, createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { scoreEvents } from '../../data/scoreEvents'
import styles from './ScoreFeed.module.css'

// Same derived event log as PollDeltaFeed (data/scoreEvents.js), a
// completely different surface for it: reverse-chronological cards
// instead of compact rows, with filter chips and a live-ticking relative
// timestamp. The point isn't new data -- it's that one signal can drive
// two genuinely different product treatments with zero coupling between
// them. The snapshot view (DeskCard) shows where things are now; this
// shows how they got there.

const KINDS = [
  { key: 'all', label: 'all' },
  { key: 'live', label: 'went live' },
  { key: 'score', label: 'score' },
  { key: 'final', label: 'final' },
  { key: 'appeared', label: 'appeared' },
]

const KIND_ICON = { appeared: '+', live: '●', score: '⇄', final: '✓' }

const RENDER_CAP = 40

function relativeLabel(at, now) {
  const s = Math.max(0, Math.floor((now - at) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

export function ScoreFeed() {
  const [filter, setFilter] = createSignal('all')
  const [now, setNow] = createSignal(Date.now())

  onMount(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(handle))
  })

  const ordered = createMemo(() => [...scoreEvents()].reverse())
  const filtered = createMemo(() => {
    const f = filter()
    return f === 'all' ? ordered() : ordered().filter(e => e.kind === f)
  })
  const counts = createMemo(() => {
    const c = { all: scoreEvents().length }
    for (const e of scoreEvents()) c[e.kind] = (c[e.kind] ?? 0) + 1
    return c
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Score Feed</span>
        <span class={styles.sublabel}>same events as Poll Delta Feed, a different surface</span>
      </header>
      <div class={styles.chipRow}>
        <For each={KINDS}>
          {k => (
            <button
              type="button"
              class={styles.chip}
              data-active={filter() === k.key}
              aria-pressed={filter() === k.key}
              onClick={() => setFilter(k.key)}
            >
              {k.label} <span class={styles.chipCount}>{counts()[k.key] ?? 0}</span>
            </button>
          )}
        </For>
      </div>
      <Show
        when={filtered().length}
        fallback={<p class={styles.empty}>No {filter() === 'all' ? '' : `${filter()} `}events yet.</p>}
      >
        <div class={styles.feed}>
          <For each={filtered().slice(0, RENDER_CAP)}>
            {e => (
              <article class={`${styles.card} ${styles['kind_' + e.kind]}`}>
                <span class={styles.icon} aria-hidden="true">{KIND_ICON[e.kind] ?? '•'}</span>
                <div class={styles.cardBody}>
                  <p class={styles.cardText}>{e.text}</p>
                  <span class={styles.cardTime} title={new Date(e.at).toLocaleTimeString()}>
                    {relativeLabel(e.at, now())} ago
                  </span>
                </div>
              </article>
            )}
          </For>
        </div>
        <Show when={filtered().length > RENDER_CAP}>
          <p class={styles.truncNote}>showing latest {RENDER_CAP} of {filtered().length}</p>
        </Show>
      </Show>
    </div>
  )
}
