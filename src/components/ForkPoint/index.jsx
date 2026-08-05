import { For, Show, createMemo, createSignal, createEffect } from 'solid-js'
import { forkPointCandidates, refetchForkPointCandidates } from '../../data/relay'
import { analyzeGameArc } from '../../data/dramaArcAnalysis'
import { computeFork, findBiggestForks, FORK_SAMPLE_COUNT } from '../../data/forkPoint'
import { dramaTier } from '../DeskCard'
import styles from './ForkPoint.module.css'

// The relay doesn't expose per-play descriptions or clock for archived
// games (confirmed: /archive/drama/leaderboard returns only drama_arc +
// drama_peak, docs/REAL-API-SURFACE.md) -- so "play N of M" alone still
// means nothing to a user who didn't watch the game. What IS real and
// available is the drama score AT that play, and this repo already has
// a real, ported classification for that score (dramaTier, used on
// DeskCard) -- reused here rather than inventing a new scale.
const TIER_DESCRIPTION = {
  fire: 'a red-hot moment',
  hot: 'an already-hot moment',
  warm: 'a warming-up moment',
  '': 'a still-quiet moment',
}

// Fork Point -- interactive counterfactual: pick a real archived game,
// pick a real point in its real drama_arc, pick a SECOND real archived
// game, and see what the first game's trajectory would look like if it
// had followed the second game's real path from that point on. Both
// halves of the spliced line are 100% real archived data -- see
// src/data/forkPoint.js for exactly what is and isn't computed.
const CHART_W = 320
const CHART_H = 120
const PAD_L = 34 // room for real Y-axis min/max labels
const PAD_R = 4
const PAD_T = 16 // room for the "fork" marker label above the plot area
const PAD_B = 20 // room for real X-axis index labels

// originalArc (source game's own real length) and splicedArc (the fork
// game's own real length, which is genuinely often different -- a real
// game can run longer or shorter than the one it was forked from) must
// be plotted against ONE shared x-scale, not each normalized to its own
// length independently -- otherwise the fork point wouldn't visually
// land at the same x position on both lines, and the chart would
// misrepresent which real index is which. sharedLength is always the
// longer of the two real arrays.
function toPoints(arc, min, max, sharedLength) {
  const range = max - min || 1
  return arc.map((v, i) => {
    const x = (i / (sharedLength - 1)) * (CHART_W - PAD_L - PAD_R) + PAD_L
    const y = CHART_H - PAD_B - ((v - min) / range) * (CHART_H - PAD_T - PAD_B)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function xForIndex(i, sharedLength) {
  return (i / (sharedLength - 1)) * (CHART_W - PAD_L - PAD_R) + PAD_L
}

// The marker label ("fork NN%") is wide enough to clip past the chart's
// left/right edges when the splice point sits near either end -- switch
// anchor instead of always centering so the real text stays fully visible.
function markerAnchor(x) {
  if (x < PAD_L + 30) return 'start'
  if (x > CHART_W - PAD_R - 30) return 'end'
  return 'middle'
}

export function ForkPoint() {
  const games = createMemo(() => {
    const data = forkPointCandidates.error ? undefined : forkPointCandidates()
    return (data?.games ?? [])
      .map(g => ({ raw: g, analyzed: analyzeGameArc(g) }))
      .filter(x => x.analyzed && x.analyzed.arc.length >= 10)
      .slice(0, 25)
  })

  const [sourceIdx, setSourceIdx] = createSignal(0)
  const [forkIdx, setForkIdx] = createSignal(1)
  const [splicePoint, setSplicePoint] = createSignal(null) // null = not yet touched by the user; defaults to the real arc's midpoint

  createEffect(() => {
    const gs = games()
    if (gs.length < 2) return
    // Keep selections valid as the real sample changes; default the
    // splice point to the real arc's own midpoint, not a guess.
    if (sourceIdx() >= gs.length) setSourceIdx(0)
    if (forkIdx() >= gs.length) setForkIdx(gs.length > 1 ? 1 : 0)
  })

  const result = createMemo(() => {
    const gs = games()
    if (gs.length < 2) return null
    const source = gs[sourceIdx()]?.raw
    const fork = gs[forkIdx()]?.raw
    if (!source || !fork) return null
    const maxIndex = Math.min(gs[sourceIdx()].analyzed.arc.length, gs[forkIdx()].analyzed.arc.length) - 1
    const point = Math.min(splicePoint() ?? Math.floor(maxIndex / 2), maxIndex)
    return computeFork(source, fork, point)
  })

  const chartMinMax = createMemo(() => {
    const r = result()
    if (!r) return [0, 100]
    const all = [...r.originalArc, ...r.splicedArc]
    return [Math.min(...all), Math.max(...all)]
  })

  const sharedLength = createMemo(() => {
    const r = result()
    if (!r) return 1
    return Math.max(r.originalArc.length, r.splicedArc.length)
  })

  // "Here" means nothing on its own -- WHICH real game, forked onto
  // WHICH other real game, at WHAT real moment. drama_arc is a real
  // per-play time series (confirmed in docs/outbox/cc-session-2026-07-27-
  // social-system-deep-search.md), so the splice index is a real play
  // count, not an arbitrary array position. Play count alone is still an
  // opaque coordinate to anyone who didn't watch the game, so it's paired
  // with the real drama score AT that play (originalArc[splicePoint],
  // already-computed real data, no new fetch) run through this repo's
  // existing dramaTier classification -- "how tense did it already feel"
  // is the honest substitute for "what actually happened on that play,"
  // which the relay doesn't expose.
  const spliceContext = createMemo(() => {
    const r = result()
    if (!r) return null
    const pct = r.maxIndex > 0 ? Math.round((r.splicePoint / r.maxIndex) * 100) : 0
    const seamValue = Math.round(r.originalArc[r.splicePoint])
    const tierDescription = TIER_DESCRIPTION[dramaTier(seamValue)]
    return {
      pct,
      seamValue,
      tierDescription,
      sourceLabel: `${r.sourceGame.away} @ ${r.sourceGame.home}`,
      forkLabel: `${r.forkGame.away} @ ${r.forkGame.home}`,
    }
  })

  const sourceLabel = createMemo(() => {
    const g = games()[sourceIdx()]?.raw
    return g ? `${g.away} @ ${g.home}` : ''
  })

  // The real utility isn't "manually pick one arbitrary pairing and see
  // what happens" -- it's "for THIS real game, which of its own real
  // turning points would have swung it the most." Scans every other real
  // game in the current sample against the fixed source game (see
  // findBiggestForks -- sampled, not exhaustive, disclosed in the UI) and
  // ranks by real peak swing. Independent of forkIdx/splicePoint: this
  // recomputes only when the source game or the real game pool changes,
  // not on every manual slider drag.
  const biggestForks = createMemo(() => {
    const gs = games()
    if (gs.length < 2) return []
    const source = gs[sourceIdx()]?.raw
    if (!source) return []
    const others = gs.filter((_, i) => i !== sourceIdx()).map(g => g.raw)
    return findBiggestForks(source, others).slice(0, 5)
  })

  function loadFork(f) {
    const idx = games().findIndex(g => g.raw === f.forkGame)
    if (idx === -1) return
    setForkIdx(idx)
    setSplicePoint(f.splicePoint)
  }

  // The real, plain-language payoff -- names both real games and the
  // real moment (play count + % through the game + how tense it already
  // was), not just "here," before stating what a real archived game's
  // own recorded peak (finalPeak, already validated data) becomes after
  // a real exact splice.
  const verdict = createMemo(() => {
    const r = result()
    const ctx = spliceContext()
    if (!r || !ctx) return null
    const where = `${ctx.sourceLabel}, forked onto ${ctx.forkLabel}'s path at play ${r.splicePoint} of ${r.maxIndex} (~${ctx.pct}% through the game -- ${ctx.tierDescription}, drama score ${ctx.seamValue})`
    const delta = r.splicedPeak - r.originalPeak
    if (delta === 0) return { delta, text: `${where}: the peak doesn't change -- still ${r.originalPeak}.` }
    if (delta > 0) return { delta, text: `${where}: the peak would have gone from ${r.originalPeak} to ${r.splicedPeak} -- ${delta} points more dramatic.` }
    return { delta, text: `${where}: the peak would have dropped from ${r.originalPeak} to ${r.splicedPeak} -- ${-delta} points less dramatic.` }
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Fork Point</span>
        <button class={styles.refreshBtn} onClick={refetchForkPointCandidates} aria-label="refresh">↻</button>
      </header>
      <p class={styles.note}>
        Splices two real archived drama_arcs at a real chosen index -- "what if this game had followed that
        game's path from here." No win-probability model is rerun (none is exposed client-side); this is an
        exact splice of two real arrays, shifted to connect at the seam.
      </p>

      <Show when={forkPointCandidates.error}>
        <p class={styles.error}>{String(forkPointCandidates.error)}</p>
      </Show>

      <Show when={!forkPointCandidates.error}>
        <Show when={forkPointCandidates()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={games().length >= 2} fallback={<p class={styles.empty}>Not enough real usable games in the current sample to fork between.</p>}>
            <div class={styles.pickers}>
              <label class={styles.pickerLabel}>
                Source game
                <select class={styles.select} value={sourceIdx()} onInput={e => setSourceIdx(Number(e.currentTarget.value))}>
                  <For each={games()}>
                    {(g, i) => <option value={i()}>{g.raw.away} @ {g.raw.home} ({g.raw.away_score}–{g.raw.home_score})</option>}
                  </For>
                </select>
              </label>
              <label class={styles.pickerLabel}>
                Fork into
                <select class={styles.select} value={forkIdx()} onInput={e => setForkIdx(Number(e.currentTarget.value))}>
                  <For each={games()}>
                    {(g, i) => <option value={i()}>{g.raw.away} @ {g.raw.home} ({g.raw.away_score}–{g.raw.home_score})</option>}
                  </For>
                </select>
              </label>
            </div>

            <Show when={biggestForks().length} fallback={<p class={styles.rankedForksEmpty}>No real forks meet the minimum overlap for {sourceLabel()} in the current sample.</p>}>
              <div class={styles.rankedForks}>
                <p class={styles.rankedForksLabel}>Biggest real forks for {sourceLabel()}</p>
                <ol class={styles.rankedForksList}>
                  <For each={biggestForks()}>
                    {(f, i) => {
                      const pct = f.maxIndex > 0 ? Math.round((f.splicePoint / f.maxIndex) * 100) : 0
                      return (
                        <li class={styles.rankedForkRow}>
                          <button class={styles.rankedForkBtn} onClick={() => loadFork(f)}>
                            <span class={styles.rankedForkRank}>#{i() + 1}</span>
                            <span class={styles.rankedForkText}>
                              onto {f.forkGame.away} @ {f.forkGame.home}, play {f.splicePoint} of {f.maxIndex} (~{pct}%)
                            </span>
                            <span class={styles.rankedForkDelta} classList={{ [styles.deltaUp]: f.delta > 0, [styles.deltaDown]: f.delta < 0 }}>
                              {f.delta > 0 ? '+' : ''}{f.delta}
                            </span>
                          </button>
                        </li>
                      )
                    }}
                  </For>
                </ol>
                <p class={styles.rankedForksNote}>
                  Sampled {FORK_SAMPLE_COUNT} real points per other game, not every real play -- not exhaustive.
                  Click one to load it below.
                </p>
              </div>
            </Show>

            <Show when={result()}>
              {r => (
                <>
                  <p class={styles.verdict} classList={{ [styles.verdictUp]: verdict().delta > 0, [styles.verdictDown]: verdict().delta < 0 }}>
                    {verdict().text}
                  </p>

                  <label class={styles.sliderLabel}>
                    Fork at play {r().splicePoint} of {r().maxIndex} -- {spliceContext()?.tierDescription} (drama score {spliceContext()?.seamValue})
                    <input
                      class={styles.slider}
                      type="range"
                      min="0"
                      max={r().maxIndex}
                      value={r().splicePoint}
                      onInput={e => setSplicePoint(Number(e.currentTarget.value))}
                    />
                  </label>

                  <svg class={styles.chart} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
                    {/* Real Y-axis: the actual min/max of both real arcs shown, not a guessed 0-100 scale. */}
                    <text x={PAD_L - 6} y={PAD_T + 4} text-anchor="end" class={styles.axisLabel}>{Math.round(chartMinMax()[1])}</text>
                    <text x={PAD_L - 6} y={CHART_H - PAD_B} text-anchor="end" class={styles.axisLabel}>{Math.round(chartMinMax()[0])}</text>
                    <line x1={PAD_L} x2={CHART_W - PAD_R} y1={CHART_H - PAD_B} y2={CHART_H - PAD_B} class={styles.axisLine} />

                    {/* Real X-axis: real play range, shared by both lines -- labeled "play" so the
                        numbers read as a real unit, not an unexplained index. */}
                    <text x={PAD_L} y={CHART_H - 4} text-anchor="start" class={styles.axisLabel}>play 0</text>
                    <text x={CHART_W - PAD_R} y={CHART_H - 4} text-anchor="end" class={styles.axisLabel}>play {sharedLength() - 1}</text>

                    {/* Where the two lines actually diverge -- ties the slider position to the chart directly. */}
                    <line
                      x1={xForIndex(r().splicePoint, sharedLength())} x2={xForIndex(r().splicePoint, sharedLength())}
                      y1={PAD_T} y2={CHART_H - PAD_B}
                      class={styles.forkMarkerLine}
                    />
                    <text x={xForIndex(r().splicePoint, sharedLength())} y={PAD_T - 2} text-anchor={markerAnchor(xForIndex(r().splicePoint, sharedLength()))} class={styles.forkMarkerLabel}>fork {spliceContext()?.pct ?? 0}%</text>

                    <polyline
                      points={toPoints(r().originalArc, chartMinMax()[0], chartMinMax()[1], sharedLength())}
                      class={styles.originalLine}
                    />
                    <polyline
                      points={toPoints(r().splicedArc, chartMinMax()[0], chartMinMax()[1], sharedLength())}
                      class={styles.splicedLine}
                    />
                  </svg>

                  <div class={styles.legend}>
                    <span class={styles.legendItem}><span class={styles.swatchOriginal} /> what actually happened -- {spliceContext()?.sourceLabel} (peak {r().originalPeak})</span>
                    <span class={styles.legendItem}><span class={styles.swatchSpliced} /> forked onto {spliceContext()?.forkLabel} (peak {r().splicedPeak})</span>
                  </div>
                </>
              )}
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
