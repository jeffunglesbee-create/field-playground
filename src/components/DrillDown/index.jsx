import { Show, createResource, createMemo } from 'solid-js'
import { ambientData, currentDate } from '../../data/relay'
import styles from './DrillDown.module.css'
import shared from '../shared.module.css'

// First chained resource in this repo.
//
// Every resource here uses either a static source or the shared currentDate
// signal as its input. This component introduces resource B whose SOURCE is
// resource A's resolved value -- a fundamentally different shape:
//
//   ambientData (resource A, already module-level) → top pick's game_id
//       ↓ source
//   gameContext (resource B, created here) → full game details from context
//
// When A is loading: topPickId() returns undefined, B does not fetch.
// When A resolves: topPickId() returns the pick's espn game id, B fetches.
// When currentDate changes: A re-fetches (new date), B's source goes undefined
//   momentarily (A is loading again), B's own fetch is deferred until A settles.
//
// The structural question: does chaining two independent resources produce a
// coherent loading sequence, or does B try to fetch stale/undefined source
// values between A's loading and resolved states?

const RELAY_BASE = import.meta.env.DEV ? '' : 'https://field-relay-nba.jeffunglesbee.workers.dev'

// Memo over resource A's value -- provides the stable source type (string or
// undefined) that resource B needs; prevents B from re-fetching on unrelated
// re-renders of the parent.
function useTopPickId() {
  return createMemo(() => {
    // Reads the resource only when it's NOT in error state -- calling the
    // accessor while errored throws, and createMemo evaluates EAGERLY at
    // creation (confirmed under the artifact's simulated total-fetch-
    // failure), so this would throw during DrillDown()'s own render, before
    // the careful ambientData.error guards further down in the JSX ever get
    // a chance to run. Same posture as StandingRoom/CompareToRelay.
    const d = ambientData.error ? undefined : ambientData()
    const pick = d?.pick?.ranked?.[0]
    if (!pick?.game_id) return undefined
    // game_id format from newspaper: "espn:401816251"
    // context endpoint games use espn_event_id: "401816251"
    return pick.game_id.startsWith('espn:') ? pick.game_id.slice(5) : undefined
  })
}

function useTopPick() {
  return createMemo(() => (ambientData.error ? undefined : ambientData())?.pick?.ranked?.[0] ?? null)
}

async function fetchGameContext(espnId) {
  const date = currentDate()
  const res = await fetch(`${RELAY_BASE}/context/date/${date}`)
  if (!res.ok) throw new Error(`context fetch failed: ${res.status}`)
  const json = await res.json()
  const all = [...(json.games?.regular ?? []), ...(json.games?.postseason ?? [])]
  return all.find(g => g.espn_event_id === espnId) ?? null
}

export function DrillDown() {
  const topPickId = useTopPickId()
  const topPick = useTopPick()

  // Resource B: source is A's derived value. When topPickId() is undefined
  // (A is still loading or today's top pick has no espn ID), B stays idle.
  const [gameContext] = createResource(topPickId, fetchGameContext)

  const odds = createMemo(() => {
    const raw = gameContext()?.opening_odds
    if (!raw) return null
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const ml = parsed?.moneyline
      if (!ml) return null
      return { home: ml.home, away: ml.away }
    } catch { return null }
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Drill-Down</span>
        <span class={styles.sublabel}>resource B sourced from resource A</span>
      </header>

      <Show when={ambientData.loading}>
        <div class={shared.skeleton}>
          <div class={`${shared.bar} ${shared.wide}`} />
          <div class={`${shared.bar} ${shared.medium}`} />
        </div>
      </Show>

      <Show when={ambientData.error}>
        <p class={styles.error}>{String(ambientData.error)}</p>
      </Show>

      <Show when={!ambientData.loading && !ambientData.error}>
        <Show when={topPick()} fallback={<p class={styles.empty}>No editorial pick for today.</p>}>
          <div class={styles.pickRow}>
            <span class={styles.pickSport}>{topPick()?.sport}</span>
            <span class={styles.pickMatchup}>{topPick()?.away} @ {topPick()?.home}</span>
            <span class={styles.pickScore} title="drama/quality score">q{topPick()?.score}</span>
          </div>
        </Show>

        <Show when={topPickId()} fallback={
          <p class={styles.note}>No ESPN ID on today's top pick — resource B has no source to fetch.</p>
        }>
          <div class={styles.chainIndicator}>
            <span class={styles.chainArrow}>↓</span>
            <span class={styles.chainLabel}>resource B fetching context for espn:{topPickId()}</span>
          </div>

          <Show when={gameContext.loading}>
            <div class={shared.skeleton}>
              <div class={`${shared.bar} ${shared.medium}`} />
              <div class={`${shared.bar} ${shared.narrow}`} />
            </div>
          </Show>

          <Show when={gameContext.error}>
            <p class={styles.error}>{String(gameContext.error)}</p>
          </Show>

          <Show when={!gameContext.loading && !gameContext.error}>
            <Show when={gameContext()} fallback={<p class={styles.empty}>Game not found in context for today.</p>}>
              <div class={styles.contextCard}>
                <div class={styles.contextRow}>
                  <span class={styles.contextKey}>venue</span>
                  <span class={styles.contextVal}>{gameContext()?.venue ?? '—'}</span>
                </div>
                <div class={styles.contextRow}>
                  <span class={styles.contextKey}>streams</span>
                  <span class={styles.contextVal}>{gameContext()?.streams ?? '—'}</span>
                </div>
                <Show when={odds()}>
                  <div class={styles.contextRow}>
                    <span class={styles.contextKey}>ML odds</span>
                    <span class={styles.contextVal}>
                      home {odds()?.home > 0 ? '+' : ''}{odds()?.home} · away {odds()?.away > 0 ? '+' : ''}{odds()?.away}
                    </span>
                  </div>
                </Show>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
