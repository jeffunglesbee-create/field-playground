import { For, Show, createMemo } from 'solid-js'
import { leverageIndexCandidates, refetchLeverageIndexCandidates } from '../../data/relay'
import { computeLeverageIndex } from '../../data/leverageIndex'
import styles from './LeverageIndex.module.css'

// Leverage Index -- the real sabermetric concept applied to this
// repo's own real drama_arc data: how much more (or less) a single
// moment moved the score than an average moment in the same real
// game. Ranks real archived games by their single most decisive real
// moment.
//
// NO PATTERN MATCHING: src/data/leverageIndex.js's computeLeverageIndex
// is exact arithmetic on adjacent real array entries -- one
// subtraction, one division, per index, no smoothing, no fuzzy
// thresholds, no inference.
const RESULT_LIMIT = 15
const MEDALS = ['🥇', '🥈', '🥉']

export function LeverageIndex() {
  const ranked = createMemo(() => {
    const data = leverageIndexCandidates.error ? undefined : leverageIndexCandidates()
    const games = data?.games ?? []
    return games
      .map(computeLeverageIndex)
      .filter(Boolean)
      .sort((a, b) => b.peakLeverage - a.peakLeverage)
      .slice(0, RESULT_LIMIT)
  })

  // Real, plain-language payoff -- states what the #1 real result actually
  // means before the ranked list, instead of leaving "4.2x" for the reader
  // to interpret unaided.
  const verdict = createMemo(() => {
    const top = ranked()[0]
    if (!top) return null
    return `Today's single most decisive real moment: ${top.game.away} @ ${top.game.home}, where the score swung ${top.peakLeverage.toFixed(1)}x harder than an average moment in that game (${top.peakFrom} → ${top.peakTo}).`
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Leverage Index</span>
        <button class={styles.refreshBtn} onClick={refetchLeverageIndexCandidates} aria-label="refresh">↻</button>
      </header>
      <p class={styles.note}>
        Real archived games ranked by their single most decisive moment -- the one index-to-index jump in the
        real drama_arc that moved the score furthest above that game's own average swing. 1.0x is an average
        moment; higher is more decisive.
      </p>

      <Show when={leverageIndexCandidates.error}>
        <p class={styles.error}>{String(leverageIndexCandidates.error)}</p>
      </Show>

      <Show when={!leverageIndexCandidates.error}>
        <Show when={leverageIndexCandidates()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={ranked().length} fallback={<p class={styles.empty}>No usable arcs in today's sample.</p>}>
            <p class={styles.verdict}>{verdict()}</p>
            <ol class={styles.rows}>
              <For each={ranked()}>
                {(r, i) => (
                  <li class={styles.row}>
                    <span class={styles.rank}>{MEDALS[i()] ?? `#${i() + 1}`}</span>
                    <div class={styles.rowBody}>
                      <div class={styles.rowMain}>
                        <span class={styles.matchup}>{r.game.away} @ {r.game.home}</span>
                        <span class={styles.score}>{r.game.away_score}–{r.game.home_score}</span>
                      </div>
                      <div class={styles.arcLine}>
                        <span class={styles.leverageBadge}>{r.peakLeverage.toFixed(1)}x</span>
                        <span class={styles.jumpNote}>
                          moment {r.peakArcIndex}/{r.arc.length - 1} · {r.peakFrom} → {r.peakTo}
                        </span>
                        <span class={styles.gapNote}>avg swing {r.avgDelta.toFixed(1)}</span>
                      </div>
                    </div>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
