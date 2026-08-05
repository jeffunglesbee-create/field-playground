import { For, Show, createMemo, createSignal, createEffect } from 'solid-js'
import { forkPointCandidates, refetchForkPointCandidates } from '../../data/relay'
import { analyzeGameArc } from '../../data/dramaArcAnalysis'
import { computeFork } from '../../data/forkPoint'
import styles from './ForkPoint.module.css'

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

  // The real, plain-language payoff -- what a real archived game's own
  // recorded peak (finalPeak, already validated data) becomes after a
  // real exact splice. Leads with the answer to "why should I care"
  // before the chart, not just two numbers left for the reader to diff
  // themselves.
  const verdict = createMemo(() => {
    const r = result()
    if (!r) return null
    const delta = r.splicedPeak - r.originalPeak
    if (delta === 0) return { delta, text: `Forking here doesn't change the peak -- still ${r.originalPeak}.` }
    if (delta > 0) return { delta, text: `Forking here would have pushed the peak from ${r.originalPeak} to ${r.splicedPeak} -- ${delta} points more dramatic.` }
    return { delta, text: `Forking here would have dropped the peak from ${r.originalPeak} to ${r.splicedPeak} -- ${-delta} points less dramatic.` }
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

            <Show when={result()}>
              {r => (
                <>
                  <p class={styles.verdict} classList={{ [styles.verdictUp]: verdict().delta > 0, [styles.verdictDown]: verdict().delta < 0 }}>
                    {verdict().text}
                  </p>

                  <label class={styles.sliderLabel}>
                    Fork at index {r().splicePoint} / {r().maxIndex}
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

                    {/* Real X-axis: real index range, shared by both lines. */}
                    <text x={PAD_L} y={CHART_H - 4} text-anchor="start" class={styles.axisLabel}>0</text>
                    <text x={CHART_W - PAD_R} y={CHART_H - 4} text-anchor="end" class={styles.axisLabel}>{sharedLength() - 1}</text>

                    {/* Where the two lines actually diverge -- ties the slider position to the chart directly. */}
                    <line
                      x1={xForIndex(r().splicePoint, sharedLength())} x2={xForIndex(r().splicePoint, sharedLength())}
                      y1={PAD_T} y2={CHART_H - PAD_B}
                      class={styles.forkMarkerLine}
                    />
                    <text x={xForIndex(r().splicePoint, sharedLength())} y={PAD_T - 2} text-anchor="middle" class={styles.forkMarkerLabel}>fork</text>

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
                    <span class={styles.legendItem}><span class={styles.swatchOriginal} /> what actually happened (peak {r().originalPeak})</span>
                    <span class={styles.legendItem}><span class={styles.swatchSpliced} /> forked path (peak {r().splicedPeak})</span>
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
