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
// "Agreement" here means: does the user's subjective editorial verdict
// (W = good pick, L = bad pick) match PickEm's own objective
// correct/incorrect computation for that same game? Editorial W/L
// doesn't imply a specific team the way a PickEm pick does -- W means
// "this recommendation was worth it," not "the home team won" -- so
// agreement is checked against PickEm's own already-correct verdict,
// not by inventing a team-implication editorial data was never meant to
// carry. Only shown for games where BOTH a PickEm pick AND an editorial
// outcome exist -- nothing invented for games missing either.

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

      const editorialGood = editorialVerdict === 'W'
      const pickEmGood = pickEmVerdict === 'correct'
      const agree = editorialVerdict === 'P' ? null : editorialGood === pickEmGood

      rows.push({
        gameId: ep.game_id,
        matchup: `${ep.away} @ ${ep.home}`,
        editorialVerdict,
        pickEmVerdict,
        agree,
      })
    }
    return rows
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Agreement</span>
        <span class={styles.note}>editorial verdict vs. your PickEm pick, three sources joined</span>
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
              <Show when={row.agree !== null} fallback={<span class={styles.pushNote}>push</span>}>
                <span class={`${styles.agreeFlag} ${row.agree ? styles.agree : styles.disagree}`}>
                  {row.agree ? '✓ agree' : '✗ differ'}
                </span>
              </Show>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}
