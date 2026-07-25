import { For, Show, createMemo } from 'solid-js'
import { ambientData, deskStore } from '../../data/relay'
import { outcomes } from '../../data/outcomes'
import { picks } from '../PickEm'
import styles from './Agreement.module.css'
import shared from '../shared.module.css'

// Three independent reactive sources, joined with no glue code beyond
// the memo below: ambientData().pick.ranked (editorial picks, W/L/P via
// outcomes -- a subjective "was this game good" judgment), picks (the
// user's own home/away PickEm prediction), and deskStore (the actual,
// live-polled result). Untested territory until now -- every prior
// derived value in this repo read at most two sources.
//
// CORRECTED 2026-07-25, after reading CrossCheck's reasoning (a
// companion component built the same day, same three sources). The
// first version of this mapped editorial-W to "good" and PickEm-correct
// to "good" and compared them as an unqualified agree/disagree verdict.
// That quietly assumed a dramatic, worthwhile game correlates with the
// user's predicted team winning -- which isn't actually confirmed by
// what these fields mean. A great game can easily be one where the
// picked team lost in a close finish; that's not a "disagreement," it's
// two genuinely different questions being compared as if they were one.
// Reframed: this now explicitly labels itself as a correlation question
// ("does a good editorial pick correlate with your predicted team
// winning") rather than an assertion that the two should match. See
// CrossCheck for the more conservative sibling view -- the same three
// sources shown side by side, with no correlation claimed at all.

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

function pickEmCorrectness(game, pick) {
  if (!pick) return null
  const status = gameStatus(game)
  if (status !== 'final' && status !== 'final_ot') return null
  const winner = game.home_score > game.away_score ? 'home' : 'away'
  return pick === winner ? 'correct' : 'incorrect'
}

export function Agreement() {
  const allGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])

  const editorialPicks = createMemo(() => ambientData()?.pick?.ranked ?? [])

  const joined = createMemo(() => {
    const gamesById = {}
    for (const g of allGames()) gamesById[g.id] = g

    const rows = []
    for (const ep of editorialPicks()) {
      const editorialVerdict = outcomes()[ep.game_id] // 'W' | 'L' | 'P' | undefined
      const myPick = picks[ep.game_id] // 'home' | 'away' | undefined
      const game = gamesById[ep.game_id]
      if (!editorialVerdict || !myPick || !game) continue // only where both exist, real game found

      const pickEmVerdict = pickEmCorrectness(game, myPick) // 'correct' | 'incorrect' | null (not final yet)
      if (!pickEmVerdict) continue // game not final yet, nothing to compare

      // "correlates" not "agrees" -- see the header note above.
      const editorialGood = editorialVerdict === 'W'
      const pickEmGood = pickEmVerdict === 'correct'
      const correlates = editorialVerdict === 'P' ? null : editorialGood === pickEmGood

      rows.push({
        gameId: ep.game_id,
        matchup: `${ep.away} @ ${ep.home}`,
        editorialVerdict,
        pickEmVerdict,
        correlates,
      })
    }
    return rows
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Agreement</span>
        <span class={styles.note}>correlation, not an assertion these should match — see CrossCheck for raw signals</span>
      </header>
      <Show when={joined().length} fallback={<p class={styles.empty}>No overlapping, finalized picks yet.</p>}>
        <For each={joined()}>
          {row => (
            <div class={styles.row}>
              <span class={styles.matchup}>{row.matchup}</span>
              <span class={`${shared.chip} ${styles.verdictBadge} ${styles['ed_' + row.editorialVerdict.toLowerCase()]}`}>
                ed: {row.editorialVerdict}
              </span>
              <span class={`${shared.chip} ${styles.verdictBadge} ${styles['pe_' + row.pickEmVerdict]}`}>
                pe: {row.pickEmVerdict}
              </span>
              <Show when={row.correlates !== null} fallback={<span class={styles.pushNote}>push</span>}>
                <span class={`${styles.agreeFlag} ${row.correlates ? styles.agree : styles.disagree}`}>
                  {row.correlates ? '✓ correlates' : '✗ diverges'}
                </span>
              </Show>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}
