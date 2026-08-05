import { Show, For, createMemo, onMount, onCleanup } from 'solid-js'
import { qualityReport, refetchQualityReport } from '../../data/relay'
import styles from './QualityReport.module.css'

const POLL_MS = 15 * 60 * 1000

// A 7-day rolling aggregate over editorial prose quality, so it polls far
// less often than JournalismBrief's single latest brief -- its own
// independent cadence, same pattern as that resource's 5m poll.
//
// Every field below (summary[]/alerts[]/alert_count/brief_type_calibration)
// is the REAL response shape of GET /quality/report, confirmed via a direct
// live probe 2026-07-27. alerts[] is a real signal computed relay-side
// (each brief_type's own calibrated p25, not a client-side guess) -- this
// component surfaces it, it doesn't derive it.
function formatBriefType(type) {
  return type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function formatAlert(alert) {
  return alert === 'high_failure_rate' ? 'high failure rate' : 'below calibrated p25'
}

// summary rows use sport: null for the "all sports" bucket (e.g. slate);
// alerts use sport: "all" for the same bucket. Normalize both to the same
// key so an alert on a null-sport row actually gets matched and highlighted.
function alertKey(briefType, sport) {
  return `${briefType}|${sport ?? 'all'}`
}

export function QualityReport() {
  const data = () => (qualityReport.error ? undefined : qualityReport())

  const alertKeys = createMemo(() => {
    const d = data()
    if (!d?.alerts) return new Set()
    return new Set(d.alerts.map(a => alertKey(a.brief_type, a.sport)))
  })

  const sortedSummary = createMemo(() => {
    const d = data()
    if (!d?.summary) return []
    return [...d.summary].sort((a, b) => a.avg_score - b.avg_score)
  })

  // Real, plain-language payoff -- names the worst-scoring real
  // brief_type/sport in the current report and states how its real
  // avg_score compares to its own real calibrated threshold (from
  // alerts[], not guessed), instead of leaving the reader to scan the
  // sorted list and cross-reference the alerts themselves.
  const verdict = createMemo(() => {
    const d = data()
    const worst = sortedSummary()[0]
    if (!d || !worst) return null
    const alert = (d.alerts ?? []).find(a => alertKey(a.brief_type, a.sport) === alertKey(worst.brief_type, worst.sport))
    const label = `${formatBriefType(worst.brief_type)} (${worst.sport ?? 'all sports'})`
    if (alert) {
      const diff = (alert.threshold - worst.avg_score).toFixed(1)
      return `Worst real score in this report: ${label} at ${worst.avg_score} -- ${diff} below its own calibrated threshold of ${alert.threshold} (${alert.threshold_source}).`
    }
    return `Worst real score in this report: ${label} at ${worst.avg_score} -- not currently below its own calibrated threshold.`
  })

  onMount(() => {
    const handle = setInterval(refetchQualityReport, POLL_MS)
    onCleanup(() => clearInterval(handle))
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Quality</span>
        <Show when={data()}>
          <span class={styles.since}>{data().days}d since {data().since}</span>
        </Show>
        <button class={styles.refreshBtn} onClick={refetchQualityReport} aria-label="refresh quality report">↻</button>
      </header>
      <Show when={qualityReport.error}>
        <p class={styles.error}>{String(qualityReport.error)}</p>
      </Show>
      <Show when={!qualityReport.error}>
        <Show when={data()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show
            when={data().alert_count > 0}
            fallback={<p class={styles.allClear}>✓ no quality alerts</p>}
          >
            <p class={styles.alertSummary}>{data().alert_count} quality alert{data().alert_count === 1 ? '' : 's'}</p>
          </Show>
          <Show when={verdict()}>
            <p class={styles.verdict}>{verdict()}</p>
          </Show>
          <ul class={styles.rows}>
            <For each={sortedSummary()}>
              {(row) => (
                <li class={`${styles.row} ${alertKeys().has(alertKey(row.brief_type, row.sport)) ? styles.rowAlert : ''}`}>
                  <span class={styles.rowType}>{formatBriefType(row.brief_type)}</span>
                  <span class={styles.rowSport}>{row.sport ?? 'all sports'}</span>
                  <span class={styles.rowScore}>{row.avg_score}</span>
                  <span class={styles.rowCount}>n={row.total}</span>
                </li>
              )}
            </For>
          </ul>
          <Show when={data().alerts.length > 0}>
            <ul class={styles.alertList}>
              <For each={data().alerts}>
                {(a) => (
                  <li class={styles.alertRow}>
                    <span class={styles.alertType}>{formatBriefType(a.brief_type)} · {a.sport ?? 'all sports'}</span>
                    <span class={styles.alertDetail}>
                      {a.avg_score} vs {a.threshold} threshold ({formatAlert(a.alert)}, {a.threshold_source})
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
