import { For, Show, createMemo } from 'solid-js'
import { ambientData, impliedSide } from '../../data/relay'
import { picks, NON_MATCHUP_SPORTS } from '../PickEm'
import styles from './CompareToRelay.module.css'

// AmbientPanel renders the relay's editorial picks; PickEm renders the
// user's own game picks. Neither surface shows where the two diverge --
// this reads both existing signals (no new fetch) and joins them on the
// shared game_id to surface agreement/disagreement directly.

function useComparison() {
  return createMemo(() => {
    // Reads the resource only when it's NOT in error state -- calling the
    // accessor while errored throws, and (confirmed under the artifact's
    // simulated total-fetch-failure) a memo that throws on its first
    // evaluation doesn't reliably re-throw on later reads -- it can settle
    // into a stale `undefined` instead, which then crashes downstream
    // reads of comparison().length with an opaque error rather than the
    // real fetch failure. Same posture as StandingRoom/DayComparison.
    const data = ambientData.error ? undefined : ambientData()
    const ranked = data?.pick?.ranked ?? []
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

// Real predicted margin from the editorial pick's own score string
// (e.g. "24-17"), same regex shape as impliedSide -- used only to rank
// which real divergence is "sharpest" (editorial leaned hardest one
// way while the reader picked the other), not to claim anything about
// the outcome.
function marginFromScore(scoreStr) {
  const m = String(scoreStr ?? '').match(/(\d+)\D+(\d+)/)
  if (!m) return 0
  return Math.abs(Number(m[1]) - Number(m[2]))
}

export function CompareToRelay() {
  const comparison = useComparison()
  const divergent = createMemo(() => comparison().filter(c => c.status === 'disagree'))
  const agreeing = createMemo(() => comparison().filter(c => c.status === 'agree'))

  // Real, plain-language payoff -- states the real agreement count and
  // names the sharpest real divergence (both picks are literally the
  // same axis here, predicted winner vs predicted winner, so "agree" is
  // a plain fact, not a causal or predictive claim about either pick).
  const verdict = createMemo(() => {
    const withPick = comparison().filter(c => c.user)
    if (!withPick.length) return null
    const agree = agreeing().length
    const diff = divergent().length
    const sharpest = [...divergent()].sort((a, b) => marginFromScore(b.score) - marginFromScore(a.score))[0]
    const sharpNote = sharpest
      ? ` Sharpest split: ${sharpest.away} @ ${sharpest.home} -- editorial leans ${sharpest[sharpest.editorial]}, you picked ${sharpest[sharpest.user]}.`
      : ''
    return `You agreed with the relay's editorial pick on ${agree} of ${withPick.length} real games you picked${diff ? `, diverging on ${diff}` : ''}.${sharpNote}`
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Compare to Relay</span>
        <Show when={comparison().some(c => c.user)}>
          <span class={styles.tally}>{agreeing().length} agree · {divergent().length} diverge</span>
        </Show>
      </header>
      <Show when={comparison().length} fallback={<p class={styles.empty}>No editorial picks today.</p>}>
        <Show when={verdict()}>
          <p class={styles.verdict}>{verdict()}</p>
        </Show>
        <div class={styles.list}>
          <For each={comparison()}>{c => <CompareRow item={c} />}</For>
        </div>
      </Show>
    </div>
  )
}
