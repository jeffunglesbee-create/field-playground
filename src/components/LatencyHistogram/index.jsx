import { For, Show, createEffect, createMemo, onCleanup, onMount } from 'solid-js'
import { samples } from '../../data/fetchTiming'
import { fieldChart, destroyChart } from '../../data/chart'
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
  // The sequence, beside the distribution. `samples()` is a rolling 300-entry
  // series of real durations with timestamps; the histogram below buckets it
  // and everything else about it is discarded at the point of display. A
  // distribution answers "how slow, typically"; a line answers "is it getting
  // worse, and when did it change". Both, not either.
  let chartEl
  const durations = createMemo(() => samples().map(s => s.durationMs))

  // FIXED DOMAIN, 0-1500ms. Auto-scaling to the series maximum makes a calm
  // minute and a bad one draw identically, which is the whole failure
  // field-laboratory's spark-check.mjs was written to catch. A sample beyond
  // the ceiling is clamped rather than allowed to rescale everything.
  const CEILING_MS = 1500
  const draw = () => {
    const d = durations()
    if (!chartEl || d.length < 2) return
    fieldChart(chartEl,
      [d.map((_, i) => i), d.map(v => Math.min(v, CEILING_MS))],
      { height: 44, range: [0, CEILING_MS], colors: ['var(--accent, #7aa2f7)'],
        labels: ['request duration (ms)'] })
  }
  onMount(draw)
  // createEffect re-runs on every new sample. fieldChart takes its setData path
  // for the same element, so this updates the line rather than rebuilding the
  // canvas on each request the app makes.
  createEffect(draw)
  onCleanup(() => destroyChart(chartEl))

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
        const p95 = durations[Math.ceil(durations.length * 0.95) - 1]
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

  // Real, plain-language payoff -- states the actual overall request
  // count and average latency this session, and names the real busiest
  // endpoint by call count with its real p95, instead of leaving the
  // histogram and per-endpoint rows for the reader to scan unaided.
  const verdict = createMemo(() => {
    const o = overall()
    const busiest = byEndpoint()[0]
    if (!o || !busiest) return null
    const reqWord = o.count === 1 ? 'request' : 'requests'
    const callWord = busiest.count === 1 ? 'call' : 'calls'
    return `This session: ${o.count} ${reqWord} averaging ${o.avg}ms -- busiest endpoint is ${busiest.endpoint} (${busiest.count} ${callWord}, p95 ${busiest.p95}ms).`
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
        <Show when={verdict()}>
          <p class={styles.verdict}>{verdict()}</p>
        </Show>
        <Show when={durations().length >= 2}>
          <div class={styles.latencyChart} ref={chartEl} />
        </Show>
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
