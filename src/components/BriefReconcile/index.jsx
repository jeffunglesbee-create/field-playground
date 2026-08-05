import { For, Show, createMemo, createResource } from 'solid-js'
import styles from './BriefReconcile.module.css'

const RELAY_BASE = import.meta.env.DEV
  ? ''
  : 'https://field-relay-nba.jeffunglesbee.workers.dev'

// BriefReconcile — the first component here to fetch the SAME logical
// entity from TWO endpoints and reconcile them. Every other resource in
// this repo owns its data exclusively; nothing has had to answer "these
// two sources disagree, which is right?"
//
// Why it exists: /journalism/brief/history was built in the relay to
// serve multi-day brief history. /archive/query?brief_type=slate&
// source=cron already did that, and is already what the production
// client calls. So the endpoint has zero consumers and looks redundant.
// "Looks redundant" is not "is redundant" -- this component answers it
// with data instead of inference.
//
// THE KEYING BUG THIS EXISTS TO AVOID, found while scoping it:
// a first pass compared the two sources keyed on `date` and reported
// disagreement on half the overlapping days (07-24: 128 vs 138,
// 07-23: 123 vs 136). That was wrong. Multiple briefs exist per date --
// 07-24 has runs at 01:55 AND 10:01. History returns ALL of them;
// archive returns exactly one per date (always the ~10:01 cron). Keying
// on `date` compared *different briefs* and called it a mismatch.
//
// Keyed on `generatedAt` instead, the two sources agree on every brief
// they share. The real difference is COVERAGE, not correctness:
//   history  -> every run, but a shorter window
//   archive  -> one run per day (the cron), but further back
// That is a genuine, defensible reason for both to exist -- which the
// naive comparison would have hidden behind a false "they disagree."

async function fetchHistory() {
  const res = await fetch(`${RELAY_BASE}/journalism/brief/history?limit=20`)
  if (!res.ok) throw new Error(`history fetch failed: ${res.status}`)
  return res.json()
}

async function fetchArchive() {
  const res = await fetch(`${RELAY_BASE}/archive/query?brief_type=slate&source=cron&limit=20`)
  if (!res.ok) throw new Error(`archive fetch failed: ${res.status}`)
  return res.json()
}

const [history] = createResource(fetchHistory)
const [archive] = createResource(fetchArchive)

// Both sources timestamp the same brief identically, so generatedAt /
// created_at is the real join key. Normalized because the two use
// different field names for the same values -- brief vs brief_text,
// proseScore vs quality_score, generatedAt vs created_at.
function normHistory(d) {
  return (d?.briefs ?? []).map(b => ({
    key: b.generatedAt,
    date: b.date,
    score: b.proseScore,
    words: b.wordCount,
  }))
}

function normArchive(d) {
  const rows = d?.results ?? d?.rows ?? []
  return rows.map(r => ({
    key: r.created_at,
    date: r.date,
    score: r.quality_score,
    words: null,
  }))
}

export function BriefReconcile() {
  const rows = createMemo(() => {
    if (history.error || archive.error) return []
    const h = normHistory(history())
    const a = normArchive(archive())
    const byKey = new Map()
    for (const x of h) byKey.set(x.key, { ...byKey.get(x.key), key: x.key, date: x.date, hist: x })
    for (const x of a) byKey.set(x.key, { ...byKey.get(x.key), key: x.key, date: x.date, arch: x })
    return [...byKey.values()].sort((p, q) => String(q.key).localeCompare(String(p.key)))
  })

  const stats = createMemo(() => {
    const r = rows()
    const both = r.filter(x => x.hist && x.arch)
    const agree = both.filter(x => x.hist.score === x.arch.score)
    return {
      total: r.length,
      both: both.length,
      agree: agree.length,
      disagree: both.length - agree.length,
      histOnly: r.filter(x => x.hist && !x.arch).length,
      archOnly: r.filter(x => x.arch && !x.hist).length,
    }
  })

  // Real, plain-language payoff -- puts the real finding from this
  // file's own source comment ("the real difference is COVERAGE, not
  // correctness") on screen instead of leaving it only in code, using
  // the same stats() this component already computes.
  const headline = createMemo(() => {
    const s = stats()
    if (s.both === 0) {
      if (!s.histOnly && !s.archOnly) return null
      return `None of today's real briefs are covered by both sources yet -- ${s.histOnly} brief${s.histOnly === 1 ? '' : 's'} history has that archive doesn't, ${s.archOnly} archive has that history doesn't. That's a real coverage gap, not a disagreement -- there's nothing to compare yet.`
    }
    const pct = Math.round((s.agree / s.both) * 100)
    return `Where both real sources cover the same brief, they agree ${pct}% of the time (${s.agree}/${s.both}) -- the real difference between them is coverage (history has ${s.histOnly} brief${s.histOnly === 1 ? '' : 's'} archive doesn't, archive has ${s.archOnly} history doesn't), not correctness.`
  })

  // /quality/report buckets briefs on below_240 / above_240. Every score
  // observed is 108-141. A gate nothing can pass is worth surfacing --
  // it is either miscalibrated or measuring a different scale than what
  // is stored. Reported, not asserted: this shows the range and lets the
  // number speak.
  const scoreRange = createMemo(() => {
    const s = rows().map(x => x.hist?.score ?? x.arch?.score).filter(v => typeof v === 'number')
    if (!s.length) return null
    return { min: Math.min(...s), max: Math.max(...s), everClears240: s.some(v => v >= 240) }
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Brief Reconcile</span>
        <span class={styles.note}>two endpoints, same entity — joined on timestamp, not date</span>
      </header>

      <Show when={history.error || archive.error}>
        <p class={styles.empty}>
          Unable to load: {String(history.error?.message ?? archive.error?.message ?? '')}
        </p>
      </Show>

      <Show when={!history.error && !archive.error}>
        <Show when={rows().length} fallback={<p class={styles.empty}>Loading…</p>}>
          <Show when={headline()}>
            <p class={styles.headline}>{headline()}</p>
          </Show>
          <div class={styles.summary}>
            <span class={styles.stat}>{stats().both} shared</span>
            <span class={`${styles.stat} ${stats().disagree === 0 ? styles.good : styles.bad}`}>
              {stats().agree} agree · {stats().disagree} differ
            </span>
            <span class={styles.stat}>{stats().histOnly} history-only</span>
            <span class={styles.stat}>{stats().archOnly} archive-only</span>
          </div>

          <Show when={scoreRange()}>
            <div class={styles.threshold}>
              score range {scoreRange().min}–{scoreRange().max} ·
              {' '}clears /quality/report's 240 gate:{' '}
              <b class={scoreRange().everClears240 ? styles.good : styles.bad}>
                {scoreRange().everClears240 ? 'yes' : 'never'}
              </b>
            </div>
          </Show>

          <div class={styles.rows}>
            <For each={rows()}>
              {r => (
                <div class={styles.row}>
                  <span class={styles.key}>{String(r.key).slice(5, 16)}</span>
                  <span class={`${styles.cell} ${r.hist ? '' : styles.absent}`}>
                    {r.hist ? r.hist.score : '—'}
                  </span>
                  <span class={`${styles.cell} ${r.arch ? '' : styles.absent}`}>
                    {r.arch ? r.arch.score : '—'}
                  </span>
                  <span class={styles.verdict}>
                    {!r.hist ? 'archive only'
                      : !r.arch ? 'history only'
                      : r.hist.score === r.arch.score ? '✓'
                      : `differ (${r.hist.score} vs ${r.arch.score})`}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}
