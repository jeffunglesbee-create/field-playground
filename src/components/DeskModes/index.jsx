import { For, Show, createMemo, createSignal } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { deskStore } from '../../data/relay'
import { gameStatus } from '../DeskCard'
import styles from './DeskModes.module.css'

// DeskModes — production's renderFinalsDesk / renderPicker /
// renderUpsets, all mode-switches over the SAME game list DeskCard
// already owns. No new data source; the interesting part is that three
// genuinely different views derive from one reactive source with no
// separate fetch per mode.

function games() {
  return [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
}

// Minimal moneyline read, local to this component rather than reaching
// into Arbitrage's internals (parseOdds there is private, and this only
// needs the moneyline, not the full spread/total/source parse).
function moneyline(raw) {
  if (!raw) return null
  let o = raw
  if (typeof raw === 'string') { try { o = JSON.parse(raw) } catch { return null } }
  const ml = o?.moneyline
  if (!ml || typeof ml.home !== 'number' || typeof ml.away !== 'number') return null
  return ml
}

// --- FINALS: postseason only, elevated presentation ---
function FinalsMode() {
  const finals = createMemo(() => games().filter(g =>
    (deskStore.games?.postseason ?? []).includes(g)
  ))
  return (
    <Show when={finals().length} fallback={<p class={styles.empty}>No postseason games on this slate.</p>}>
      <div class={styles.finalsList}>
        <For each={finals()}>
          {g => {
            const status = () => gameStatus(g)
            return (
              <div class={`${styles.finalsRow} ${styles['status_' + status()]}`}>
                <span class={styles.finalsMatchup}>{g.away} @ {g.home}</span>
                <Show when={g.home_score !== null}>
                  <span class={styles.finalsScore}>{g.away_score}–{g.home_score}</span>
                </Show>
                <span class={styles.finalsBadge}>{status().toUpperCase()}</span>
              </div>
            )
          }}
        </For>
      </div>
    </Show>
  )
}

// --- PICKER: one recommended game, by drama_peak, with a visible
// runner-up so the choice is checkable rather than a black box ---
function PickerMode() {
  const ranked = createMemo(() =>
    [...games()]
      .filter(g => typeof g.drama_peak === 'number')
      .sort((a, b) => b.drama_peak - a.drama_peak)
  )
  const top = () => ranked()[0]
  const runnerUp = () => ranked()[1]

  return (
    <Show when={top()} fallback={<p class={styles.empty}>No drama data to pick from yet.</p>}>
      <div class={styles.pickerCard}>
        <span class={styles.pickerKicker}>Tonight's pick</span>
        <span class={styles.pickerMatchup}>{top().away} @ {top().home}</span>
        <span class={styles.pickerPeak}>drama peak {top().drama_peak}</span>
        <Show when={runnerUp()}>
          <span class={styles.pickerRunnerUp}>
            next closest: {runnerUp().away} @ {runnerUp().home} ({runnerUp().drama_peak})
          </span>
        </Show>
      </div>
    </Show>
  )
}

// --- UPSETS: real opening-line favorite vs actual final result.
// A team is the favorite if its moneyline is negative. An upset is the
// favorite NOT winning. Only evaluated for genuinely final games with a
// real, parseable opening line -- nothing inferred when either is
// missing. ---
function UpsetsMode() {
  const upsets = createMemo(() => {
    const out = []
    for (const g of games()) {
      const status = gameStatus(g)
      if (status !== 'final' && status !== 'final_ot') continue
      const ml = moneyline(g.opening_odds)
      if (!ml) continue
      const favorite = ml.home < ml.away ? 'home' : ml.away < ml.home ? 'away' : null
      if (!favorite) continue // pick'em line, no favorite to upset
      const winner = g.home_score > g.away_score ? 'home' : 'away'
      if (winner !== favorite) {
        out.push({
          game: g,
          favoriteTeam: favorite === 'home' ? g.home : g.away,
          favoriteLine: favorite === 'home' ? ml.home : ml.away,
          winnerTeam: favorite === 'home' ? g.away : g.home,
        })
      }
    }
    return out
  })

  return (
    <Show when={upsets().length} fallback={<p class={styles.empty}>No upsets against the opening line tonight.</p>}>
      <div class={styles.upsetsList}>
        <For each={upsets()}>
          {u => (
            <div class={styles.upsetRow}>
              <span class={styles.upsetWinner}>{u.winnerTeam}</span>
              <span class={styles.upsetOver}>over</span>
              <span class={styles.upsetFav}>{u.favoriteTeam}</span>
              <span class={styles.upsetLine}>({u.favoriteLine})</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

const MODES = [
  { key: 'finals', label: 'Finals', Component: FinalsMode },
  { key: 'picker', label: 'Picker', Component: PickerMode },
  { key: 'upsets', label: 'Upsets', Component: UpsetsMode },
]

export function DeskModes() {
  const [active, setActive] = createSignal('finals')
  const activeMode = createMemo(() => MODES.find(m => m.key === active()))

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Desk Modes</span>
        <span class={styles.note}>same deskStore, three views — no separate fetch per mode</span>
      </header>
      <div class={styles.tabs}>
        <For each={MODES}>
          {m => (
            <button
              class={`${styles.tab} ${active() === m.key ? styles.tabActive : ''}`}
              onClick={() => setActive(m.key)}
            >
              {m.label}
            </button>
          )}
        </For>
      </div>
      <div class={styles.body}>
        <Dynamic component={activeMode()?.Component} />
      </div>
    </div>
  )
}
