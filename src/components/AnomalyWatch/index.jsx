import { For, Show, createMemo, createSignal } from 'solid-js'
import { anomalyCorpus, refetchAnomalyCorpus, anomalyWindowDays, setAnomalyWindowDays } from '../../data/relay'
import { buildBaselines, describeSlate, normalizeSport, UNSCORED_SPORTS } from '../../data/anomalyBaseline'
import styles from './AnomalyWatch.module.css'

// Anomaly Watch -- which of today's (or the last completed slate's) real games
// are statistically unusual FOR THEIR OWN SPORT, stated as named conditions.
//
// Two things make this different from every other drama component here:
//
//   1. It reads the UNCENSORED slate. Everything else reads
//      /archive/drama/leaderboard, which is ranked and truncated -- a baseline
//      built from it would be a censored sample, which is exactly how this
//      repo came to believe drama_peak was "too coarse to rank with." It
//      wasn't; the sample was. See src/data/anomalyBaseline.js.
//
//   2. It never shows a score. Findings are named conditions -- "Rare high",
//      "Late surge" -- each with the real comparison that made it true, so a
//      reader can check the claim. The percentile exists internally for
//      ordering and is deliberately not rendered.
//
// It also refuses to make claims it can't support: sports whose drama is never
// computed are labelled "not measured" rather than shown as boring, and sports
// with too few distinct values get a tier that says it's a tier.

const WINDOW_OPTIONS = [7, 14, 30]

export function AnomalyWatch() {
  // "tonight" = the live slate; "last-complete" = the most recent day in the
  // window with finalized games. Both were asked for and they answer different
  // questions: what's unusual right now vs what turned out unusual.
  const [mode, setMode] = createSignal('last-complete')

  const corpus = createMemo(() => (anomalyCorpus.error ? undefined : anomalyCorpus()))

  const baselines = createMemo(() => {
    const c = corpus()
    return c ? buildBaselines(c.games) : null
  })

  // Sorted newest-first; a "complete" day is one with at least one finalized
  // game, not simply yesterday -- slates are not evenly distributed.
  const daysAvailable = createMemo(() => {
    const c = corpus()
    if (!c) return []
    const byDate = new Map()
    for (const g of c.games) {
      if (!byDate.has(g._date)) byDate.set(g._date, [])
      byDate.get(g._date).push(g)
    }
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, games]) => ({
        date,
        games,
        finals: games.filter(g => g.finalized_at).length,
      }))
  })

  const targetDay = createMemo(() => {
    const days = daysAvailable()
    if (!days.length) return null
    if (mode() === 'tonight') return days[0]
    return days.find(d => d.finals > 0) ?? null
  })

  const result = createMemo(() => {
    const b = baselines()
    const day = targetDay()
    if (!b || !day) return null
    return describeSlate(day.games, b)
  })

  // Names the single most unusual real game in plain language, before any list.
  const verdict = createMemo(() => {
    const r = result()
    const day = targetDay()
    if (!r || !day) return null
    const top = r.flagged[0]
    if (!top) {
      return `Nothing unusual on ${day.date}: all ${r.all.length} real games sit inside their own sport's normal range for this window.`
    }
    const g = top.game
    return `Most unusual on ${day.date}: ${g.away} @ ${g.home} (${top.sport}) — ${top.findings.map(f => f.label.toLowerCase()).join(', ')}.`
  })

  // Everything the corpus could NOT support a claim about, counted rather than
  // quietly dropped. A row missing from the flagged list should be explainable.
  const excluded = createMemo(() => {
    const r = result()
    if (!r) return null
    const counts = { notMeasured: 0, noBaseline: 0, unscored: 0, normal: 0 }
    for (const row of r.all) {
      if (row.status === 'not-measured') counts.notMeasured++
      else if (row.status === 'no-baseline') counts.noBaseline++
      else if (row.status === 'unscored') counts.unscored++
      else if (!row.findings.length) counts.normal++
    }
    return counts
  })

  const sportSummary = createMemo(() => {
    const b = baselines()
    if (!b) return []
    return [...b.values()].sort((x, y) => y.n - x.n)
  })

  // Surfaced rather than swallowed: if the corpus contained the same game on
  // more than one date, the population every comparison rests on was smaller
  // than the number of rows fetched, and a reader should know that.
  const duplicatesDropped = createMemo(() => {
    const b = baselines()
    if (!b) return 0
    const first = [...b.values()][0]
    return first?.duplicatesDropped ?? 0
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Anomaly Watch</span>
        <button class={styles.refreshBtn} onClick={refetchAnomalyCorpus} aria-label="refresh">↻</button>
      </header>

      <p class={styles.note}>
        Which real games are unusual <em>for their own sport</em>, measured against the full uncensored slate
        rather than a top-N leaderboard. Findings are named conditions, each stating the real comparison behind
        it — no score is shown, because a score would just be a number to trust.
      </p>

      <div class={styles.controls}>
        <div class={styles.modeGroup} role="group" aria-label="slate">
          <button
            class={mode() === 'last-complete' ? styles.modeOn : styles.modeOff}
            onClick={() => setMode('last-complete')}
          >Last completed slate</button>
          <button
            class={mode() === 'tonight' ? styles.modeOn : styles.modeOff}
            onClick={() => setMode('tonight')}
          >Tonight</button>
        </div>
        <label class={styles.windowLabel}>
          baseline window
          <select
            class={styles.windowSelect}
            value={anomalyWindowDays()}
            onChange={e => setAnomalyWindowDays(Number(e.currentTarget.value))}
          >
            <For each={WINDOW_OPTIONS}>{d => <option value={d}>{d} days</option>}</For>
          </select>
        </label>
      </div>

      <Show when={anomalyCorpus.error}>
        <p class={styles.error}>{String(anomalyCorpus.error)}</p>
      </Show>

      <Show when={!anomalyCorpus.error}>
        <Show when={corpus()} fallback={<p class={styles.loading}>Building baseline from the real slate…</p>}>
          {/* A partial corpus is usable but must say so -- "12 of 14 days" is a
              different claim from "14 days," and the difference is what a
              percentile rests on. */}
          <Show when={corpus().daysOk < corpus().daysRequested}>
            <p class={styles.warn}>
              Baseline built from {corpus().daysOk} of {corpus().daysRequested} requested days —
              {' '}{corpus().failedDates.length} slate fetch{corpus().failedDates.length === 1 ? '' : 'es'} failed
              ({corpus().failedDates.slice(0, 3).join(', ')}{corpus().failedDates.length > 3 ? '…' : ''}).
              Treat the comparisons below as resting on a smaller population than requested.
            </p>
          </Show>

          <Show when={duplicatesDropped() > 0}>
            <p class={styles.warn}>
              {duplicatesDropped()} duplicate game row{duplicatesDropped() === 1 ? '' : 's'} dropped before building
              the baseline — the same game appeared on more than one fetched date. The population below is the
              de-duplicated count, not the number of rows fetched.
            </p>
          </Show>

          <Show when={targetDay()} fallback={<p class={styles.empty}>No completed slate in this window yet.</p>}>
            <p class={styles.verdict}>{verdict()}</p>

            <Show when={result()?.flagged.length} fallback={
              <p class={styles.empty}>
                No game on {targetDay().date} met any named condition. That is a real result, not an empty state.
              </p>
            }>
              <ul class={styles.rows}>
                <For each={result().flagged}>
                  {(r) => (
                    <li class={styles.row}>
                      <div class={styles.rowMain}>
                        <span class={styles.matchup}>{r.game.away} @ {r.game.home}</span>
                        <span class={styles.score}>{r.game.away_score}–{r.game.home_score}</span>
                        <span class={styles.sport}>{r.sport}</span>
                        <Show when={!r.isFinal}>
                          <span class={styles.liveTag}>in progress</span>
                        </Show>
                      </div>
                      <ul class={styles.findings}>
                        <For each={r.findings}>
                          {(f) => (
                            <li class={styles.finding}>
                              <span class={styles.findingLabel} data-finding={f.id}>{f.label}</span>
                              <span class={styles.findingWhy}>{f.why}</span>
                            </li>
                          )}
                        </For>
                      </ul>
                      <Show when={r.arcPartial}>
                        <p class={styles.partialNote}>
                          Arc is still partial — shape findings (surge, fizzle, flatness) are withheld until this game is final.
                        </p>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>

            <Show when={excluded()}>
              <p class={styles.excluded}>
                Also on this slate: {excluded().normal} inside normal range
                {excluded().notMeasured ? `, ${excluded().notMeasured} not measured (drama is never computed for ${[...UNSCORED_SPORTS].join(' / ')})` : ''}
                {excluded().noBaseline ? `, ${excluded().noBaseline} with too small a sport population to judge` : ''}
                {excluded().unscored ? `, ${excluded().unscored} carrying no drama_peak yet` : ''}.
              </p>
            </Show>
          </Show>

          <details class={styles.details}>
            <summary class={styles.summary}>Baselines this is measured against</summary>
            <table class={styles.table}>
              <thead>
                <tr><th>sport</th><th>games</th><th>distinct</th><th>basis</th></tr>
              </thead>
              <tbody>
                <For each={sportSummary()}>
                  {(b) => (
                    <tr>
                      <td>{b.sport}</td>
                      <td class={styles.num}>{b.n}</td>
                      <td class={styles.num}>{b.distinct}</td>
                      <td>{b.resolution === 'distribution' ? 'percentile' : 'coarse tier'}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <p class={styles.tableNote}>
              Sport labels are case-folded — the real corpus carries both <code>WNBA</code> and <code>wnba</code> for
              one sport, and bucketing without folding splits it in two. Known contamination, measured 2026-08-06 and
              not silently corrected here: 52 of 60 checkable rows labelled <code>FIFA World Cup</code> are really MLS,
              so that bucket is a mix until the relay label fix ships.
            </p>
          </details>
        </Show>
      </Show>
    </div>
  )
}
