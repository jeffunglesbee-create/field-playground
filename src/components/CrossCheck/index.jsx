import { For, Show, createMemo } from 'solid-js'
import { deskStore, ambientData } from '../../data/relay'
import { outcomes } from '../../data/outcomes'
import { picks } from '../PickEm'
import styles from './CrossCheck.module.css'
import shared from '../shared.module.css'

// Three independent reactive sources, joined with zero glue code:
// AmbientPanel's editorial picks (ambientData().pick.ranked, tier +
// W/L/P outcome), PickEm's user picks (picks store, home/away), and
// deskStore's live results. Each ranked editorial pick has a game_id
// that matches a deskStore game row -- the join key already exists,
// nothing invented to make this work.
//
// Deliberately NOT computing an "agreement" verdict between editorial
// W/L/P and the user's home/away pick -- those are different axes
// (editorial W/L/P tracks whether the RECOMMENDATION was validated, not
// confirmed to mean "the predicted team won specifically"; PickEm's
// pick is unambiguously a team prediction). Asserting they agree or
// disagree would mean guessing a semantic mapping that isn't confirmed.
// This shows all three signals side by side instead, reactively, which
// is the actual mechanism under test -- does a derived read of three
// independent sources update automatically when any one of them
// changes, with no manual coordination between them.
function CrossRow(props) {
  const pick = () => props.editorialPick
  const gameId = () => pick().game_id
  const game = createMemo(() =>
    [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
      .find(g => g.id === gameId())
  )
  const editorialOutcome = () => outcomes()[gameId()] ?? null
  const userPick = () => picks[gameId()] ?? null
  const liveState = createMemo(() => {
    const g = game()
    if (!g) return 'no data'
    if (g.home_score === null) return 'pregame'
    if (g.finalized_at) return `final ${g.away_score}\u2013${g.home_score}`
    return `live ${g.away_score}\u2013${g.home_score}`
  })

  return (
    <div class={styles.row}>
      <span class={styles.matchup}>{pick().away} @ {pick().home}</span>
      <div class={styles.signals}>
        <span class={styles.signal}>
          <span class={styles.signalLabel}>Editorial</span>
          <span class={`${shared.chip} ${styles.signalValue} ${editorialOutcome() ? styles['out_' + editorialOutcome().toLowerCase()] : styles.outNone}`}>
            {editorialOutcome() ?? '\u2014'}
          </span>
        </span>
        <span class={styles.signal}>
          <span class={styles.signalLabel}>Your Pick</span>
          <span class={`${shared.chip} ${styles.signalValue} ${userPick() ? styles.pickSet : styles.outNone}`}>
            {userPick() ? pick()[userPick()] : '\u2014'}
          </span>
        </span>
        <span class={styles.signal}>
          <span class={styles.signalLabel}>Live</span>
          <span class={styles.signalValue}>{liveState()}</span>
        </span>
      </div>
    </div>
  )
}

export function CrossCheck() {
  // Reads the resource only when it's NOT in error state -- calling the
  // accessor while errored throws, and (confirmed under the artifact's
  // simulated total-fetch-failure) a memo that throws on its first
  // evaluation doesn't reliably re-throw on later reads -- it can settle
  // into a stale `undefined` instead, which then crashes downstream reads
  // of editorialPicks().length with an opaque error rather than the real
  // fetch failure. Same posture as StandingRoom/DayComparison.
  const editorialPicks = createMemo(() => (ambientData.error ? undefined : ambientData())?.pick?.ranked ?? [])

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Cross-Check</span>
        <span class={styles.note}>editorial + your pick + live, joined live</span>
      </header>
      <Show when={editorialPicks().length} fallback={<p class={styles.empty}>No editorial picks today.</p>}>
        <For each={editorialPicks()}>{p => <CrossRow editorialPick={p} />}</For>
      </Show>
    </div>
  )
}
