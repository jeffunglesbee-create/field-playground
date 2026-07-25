import { For, Show, createMemo } from 'solid-js'
import { ambientData } from '../../data/relay'
import { picks, NON_MATCHUP_SPORTS } from '../PickEm'
import styles from './CompareToRelay.module.css'

// AmbientPanel renders the relay's editorial picks; PickEm renders the
// user's own game picks. Neither surface shows where the two diverge --
// this reads both existing signals (no new fetch) and joins them on the
// shared game_id to surface agreement/disagreement directly.

// Editorial picks encode their implied winner in the "score" string
// ("2–1" = home 2, away 1, home favored), not as an explicit side field.
// Parses the two leading integers regardless of which dash character
// separates them (en dash in the real data, hyphen is a safe fallback).
function impliedSide(scoreStr) {
  const m = String(scoreStr ?? '').match(/(\d+)\D+(\d+)/)
  if (!m) return null
  const [, homeNum, awayNum] = m.map(Number)
  if (homeNum === awayNum) return null
  return homeNum > awayNum ? 'home' : 'away'
}

function useComparison() {
  return createMemo(() => {
    const ranked = ambientData()?.pick?.ranked ?? []
    return ranked
      .filter(p => !NON_MATCHUP_SPORTS.has(p.sport?.toLowerCase()))
      .map(p => {
        const editorial = impliedSide(p.score)
        const user = picks[p.game_id] ?? null
        const status = !user ? 'no_pick' : !editorial ? 'unclear' : user === editorial ? 'agree' : 'disagree'
        return { ...p, editorial, user, status }
      })
  })
}

function CompareRow(props) {
  const c = () => props.item
  return (
    <div class={`${styles.row} ${styles['status_' + c().status]}`}>
      <span class={styles.matchup}>{c().away} @ {c().home}</span>
      <span class={styles.editorialPick}>
        editorial: <strong>{c().editorial ? c()[c().editorial] : '—'}</strong>
      </span>
      <span class={styles.userPick}>
        you: <strong>{c().user ? c()[c().user] : 'no pick'}</strong>
      </span>
      <span class={styles.statusIcon} title={c().status}>
        {c().status === 'agree' ? '✓' : c().status === 'disagree' ? '⚡' : '·'}
      </span>
    </div>
  )
}

export function CompareToRelay() {
  const comparison = useComparison()
  const divergent = createMemo(() => comparison().filter(c => c.status === 'disagree'))
  const agreeing = createMemo(() => comparison().filter(c => c.status === 'agree'))

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Compare to Relay</span>
        <Show when={comparison().some(c => c.user)}>
          <span class={styles.tally}>{agreeing().length} agree · {divergent().length} diverge</span>
        </Show>
      </header>
      <Show when={comparison().length} fallback={<p class={styles.empty}>No editorial picks today.</p>}>
        <div class={styles.list}>
          <For each={comparison()}>{c => <CompareRow item={c} />}</For>
        </div>
      </Show>
    </div>
  )
}
