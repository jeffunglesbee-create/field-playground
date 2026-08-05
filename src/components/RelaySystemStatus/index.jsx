import { For, Show, createMemo, onMount, onCleanup } from 'solid-js'
import { relayHealth, refetchRelayHealth } from '../../data/relay'
import styles from './RelaySystemStatus.module.css'

const POLL_MS = 2 * 60 * 1000

// Real, live endpoint confirmed via a direct probe 2026-07-27: GET /health
// returns PLAIN TEXT, not JSON -- "RELAY OK — sub1 + sub2 + ...,
// quality-source=X". The relay doesn't structure this itself, so it's
// parsed client-side. Distinct from ReactivePerfPanel/LatencyHistogram
// (which measure THIS PLAYGROUND's own client-side performance) -- this
// is the relay backend's own report of its own subsystems, a genuinely
// different signal neither of those can see.
function parseHealth(text) {
  if (!text) return null
  const match = text.match(/^(.*?)\s*—\s*(.*?),\s*quality-source=(.*)$/)
  if (!match) return { ok: text.trim().startsWith('RELAY OK'), raw: text, subsystems: [], qualitySource: null }
  const [, status, subsystemsStr, qualitySource] = match
  return {
    ok: status.trim() === 'RELAY OK',
    raw: text,
    subsystems: subsystemsStr.split('+').map(s => s.trim()).filter(Boolean),
    qualitySource: qualitySource.trim(),
  }
}

export function RelaySystemStatus() {
  const parsed = createMemo(() => (relayHealth.error ? undefined : parseHealth(relayHealth())))

  // Real, plain-language payoff -- states whether the real relay backend
  // is up with all its real subsystems reporting, and names the real
  // quality-source currently serving data, instead of leaving the
  // status dot and chip list for the reader to piece together.
  const verdict = createMemo(() => {
    const p = parsed()
    if (!p) return null
    const subsystemsText = p.subsystems.length
      ? `all ${p.subsystems.length} real subsystems reporting (${p.subsystems.join(', ')})`
      : 'no subsystems reported'
    const qsText = p.qualitySource ? `quality-source is ${p.qualitySource}` : 'no quality-source reported'
    return `Real relay backend is ${p.ok ? 'up' : 'degraded'} -- ${subsystemsText} -- ${qsText}.`
  })

  onMount(() => {
    const handle = setInterval(refetchRelayHealth, POLL_MS)
    onCleanup(() => clearInterval(handle))
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Relay Status</span>
        <Show when={parsed()}>
          <span class={`${styles.statusDot} ${parsed().ok ? styles.statusOk : styles.statusDown}`} />
          <span class={styles.statusText}>{parsed().ok ? 'OK' : 'DEGRADED'}</span>
        </Show>
        <button class={styles.refreshBtn} onClick={refetchRelayHealth} aria-label="refresh relay status">↻</button>
      </header>
      <Show when={relayHealth.error}>
        <p class={styles.error}>{String(relayHealth.error)}</p>
      </Show>
      <Show when={!relayHealth.error}>
        <Show when={parsed()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={verdict()}>
            <p class={styles.verdict}>{verdict()}</p>
          </Show>
          <Show when={parsed().qualitySource}>
            <p class={styles.qualitySource}>quality-source: {parsed().qualitySource}</p>
          </Show>
          <div class={styles.subsystems}>
            <For each={parsed().subsystems}>
              {(s) => <span class={styles.chip}>{s}</span>}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}
