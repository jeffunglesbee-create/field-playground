import { For } from 'solid-js'
import styles from './ControlGroup.module.css'

// The SolidJS side of the control group -- reads the SAME already-
// reconciled deskStore this whole app already polls every 15s
// (relay.js's fetchDeskReconciled calls setDeskStore(reconcile(json))).
// <For> keys on each item's own identity from the reconciled store: an
// unchanged game is the same object reference between polls, so Solid
// never re-runs its row -- no signature bookkeeping, no manual DOM
// lookup, no explicit "skip unchanged" branch. The reconciliation this
// component relies on already happened one layer up, in the store.

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

function scoreText(g) {
  if (g.home_score === null) return '—'
  const status = gameStatus(g)
  const suffix = status === 'final_ot' ? ' F/OT' : status === 'final' ? ' F' : ''
  return `${g.away_score}-${g.home_score}${suffix}`
}

export function ReconcileGameList(props) {
  return (
    <div class={styles.list} ref={props.ref}>
      <For each={props.games()}>
        {(g) => (
          <div class={styles.row} data-game-id={g.id}>
            <span class={styles.matchup}>{g.away} @ {g.home}</span>
            <span class={styles.score}>{scoreText(g)}</span>
          </div>
        )}
      </For>
    </div>
  )
}
