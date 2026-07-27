import { For, Show, createMemo } from 'solid-js'
import { archiveQuery, archiveDate, setArchiveDate, refetchArchiveQuery } from '../../data/relay'
import styles from './BriefArchive.module.css'

// Real, live endpoint confirmed via a direct probe 2026-07-27: GET
// /archive/query?date=X -> {ok, count, results[]} -- EVERY brief
// generated that day, not just the single current one JournalismBrief
// shows. Real confirmed fields per result: id, date, brief_type, sport,
// game_id, brief_text, model, quality_score, word_count, source,
// created_at.
//
// quality_score here is NOT assumed to be the same metric as
// JournalismBrief's proseScore under a different name -- nothing
// confirms that, and this session has been burned before by assuming a
// field means what its neighbor's name suggests. They're presented as
// two separate, independently real numbers.
function formatBriefType(type) {
  return type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function shiftDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

function formatTime(createdAt) {
  // Real format confirmed live: "2026-07-26 22:31:26" (space-separated,
  // implicitly UTC per the relay's own convention elsewhere in this repo).
  const m = createdAt?.match(/(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : createdAt
}

function BriefRow(props) {
  const b = () => props.brief
  return (
    <li class={styles.row}>
      <details class={styles.details}>
        <summary class={styles.summary}>
          <span class={styles.type}>{formatBriefType(b().brief_type)}</span>
          <Show when={b().sport}>
            <span class={styles.sport}>{b().sport}</span>
          </Show>
          <span class={styles.time}>{formatTime(b().created_at)}</span>
          <span class={styles.score}>{b().quality_score}</span>
        </summary>
        <p class={styles.briefText}>{b().brief_text}</p>
        <p class={styles.meta}>
          {b().word_count} words · {b().source}{b().model ? ` · ${b().model}` : ''}
        </p>
      </details>
    </li>
  )
}

export function BriefArchive() {
  const data = () => (archiveQuery.error ? undefined : archiveQuery())

  const sortedResults = createMemo(() => {
    const d = data()
    if (!d?.results) return []
    return [...d.results].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  })

  const avgScore = createMemo(() => {
    const results = sortedResults()
    if (!results.length) return null
    return Math.round(results.reduce((sum, r) => sum + r.quality_score, 0) / results.length)
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Brief Archive</span>
        <div class={styles.dateStepper}>
          <button class={styles.stepBtn} onClick={() => setArchiveDate(shiftDate(archiveDate(), -1))} aria-label="previous day">‹</button>
          <span class={styles.dateLabel}>{archiveDate()}</span>
          <button class={styles.stepBtn} onClick={() => setArchiveDate(shiftDate(archiveDate(), 1))} aria-label="next day">›</button>
        </div>
        <button class={styles.refreshBtn} onClick={refetchArchiveQuery} aria-label="refresh brief archive">↻</button>
      </header>
      <Show when={archiveQuery.error}>
        <p class={styles.error}>{String(archiveQuery.error)}</p>
      </Show>
      <Show when={!archiveQuery.error}>
        <Show when={data()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={sortedResults().length} fallback={<p class={styles.empty}>No briefs archived for this date.</p>}>
            <p class={styles.summaryLine}>{sortedResults().length} briefs · avg quality {avgScore()}</p>
            <ul class={styles.rows}>
              <For each={sortedResults()}>{(b) => <BriefRow brief={b} />}</For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
