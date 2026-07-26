import { For, Show, createMemo } from 'solid-js'
import { samples } from '../../data/fetchTiming'
import styles from './LatencyHistogram.module.css'

// Reads fetchTiming's globally-instrumented sample stream -- every
// createResource fetcher in this app runs through the same wrapped
// window.fetch, so this sees ambient/desk/standings/journalism/day-context/
// multi-date-trend requests alike, with zero per-fetcher wiring.

const BUCKETS = [
  { max: 50, label: '<50' },
  { max: 100, label: '50-100' },
  { max: 250, label: '100-250' },
  { max: 500, label: '250-500' },
  { max: 1000, label: '500-1000' },
  { max: Infinity, label: '1000+' },
]

function bucketFor(ms) {
  return BUCKETS.find(b => ms < b.max) ?? BUCKETS[BUCKETS.length - 1]
}

function HistogramBar(props) {
  return (
    <div class={styles.histRow}>
      <span class={styles.histLabel}>{props.bucket.label}ms</span>
      <div class={styles.histTrack}>
        <div class={styles.histFill} style={{ width: `${props.pct}%` }} />
      </div>
      <span class={styles.histCount}>{props.count}</span>
    </div>
  )
}

function EndpointRow(props) {
  const r = () => props.row
  return (
    <div class={styles.endpointRow}>
      <span class={styles.endpointPath} title={r().endpoint}>{r().endpoint}</span>
      <span class={styles.endpointStat}>{r().count}×</span>
      <span class={styles.endpointStat}>avg {r().avg}ms</span>
      <span class={styles.endpointStat}>p95 {r().p95}ms</span>
      <Show when={r().errors > 0}>
        <span class={styles.endpointError}>{r().errors} failed</span>
      </Show>
    </div>
  )
}

export function LatencyHistogram() {
  const histogram = createMemo(() => {
    const counts = new Map(BUCKETS.map(b => [b.label, 0]))
    for (const s of samples()) {
      const b = bucketFor(s.durationMs)
      counts.set(b.label, counts.get(b.label) + 1)
    }
    const max = Math.max(1, ...counts.values())
    return BUCKETS.map(b => ({ bucket: b, count: counts.get(b.label), pct: (counts.get(b.label) / max) * 100 }))
  })

  const byEndpoint = createMemo(() => {
    const groups = new Map()
    for (const s of samples()) {
      if (!groups.has(s.endpoint)) groups.set(s.endpoint, [])
      groups.get(s.endpoint).push(s)
    }
    return Array.from(groups.entries())
      .map(([endpoint, list]) => {
        const durations = list.map(s => s.durationMs).sort((a, b) => a - b)
        const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        const p95 = durations[Math.floor(durations.length * 0.95)] ?? durations[durations.length - 1]
        return { endpoint, count: list.length, avg, p95: Math.round(p95), errors: list.filter(s => !s.ok).length }
      })
      .sort((a, b) => b.count - a.count)
  })

  const overall = createMemo(() => {
    const list = samples()
    if (!list.length) return null
    const durations = list.map(s => s.durationMs)
    return {
      count: list.length,
      avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      max: Math.round(Math.max(...durations)),
    }
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Relay Latency</span>
        <span class={styles.sublabel}>every fetch, instrumented app-wide</span>
      </header>
      <Show when={overall()} fallback={<p class={styles.empty}>No requests captured yet.</p>}>
        <p class={styles.note}>
          {overall().count} requests · avg {overall().avg}ms · max {overall().max}ms
        </p>
        <div class={styles.histogram}>
          <For each={histogram()}>{h => <HistogramBar bucket={h.bucket} count={h.count} pct={h.pct} />}</For>
        </div>
        <div class={styles.endpointList}>
          <For each={byEndpoint()}>{row => <EndpointRow row={row} />}</For>
        </div>
      </Show>
    </div>
  )
}
