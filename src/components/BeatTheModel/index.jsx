import { createSignal, createMemo, createEffect, Show, For } from 'solid-js'
import { beatTheModelCandidates, refetchBeatTheModelCandidates } from '../../data/relay'
import { dramaTier, dramaLabel } from '../DeskCard'
import { stats, recordGuess, resetStats } from '../../data/beatTheModel'
import styles from './BeatTheModel.module.css'

// Beat the Model -- a blind-guess game against real archived games.
// Real matchup, real final score, real date shown; the real drama_peak
// is withheld until you commit to a tier guess. Retrospective only:
// drama_peak/drama_arc are archived post-hoc data (RUWT/ADR-002: never
// live), so this can never be a live "guess what happens next"
// forecast, and doesn't pretend to be one.
//
// Reuses the same real /archive/drama/leaderboard endpoint TheUnwatched
// and HallOfSurprises already use, via its own independent relay.js
// resource (beatTheModelCandidates) so reshuffling this game's sample
// never affects theirs.
//
// Running score is local-only (src/data/beatTheModel.js) -- no shared
// leaderboard, since window.storage's shared mode doesn't exist for
// this session (confirmed 2026-08-02).
const TIERS = ['cold', 'warm', 'hot', 'fire']

function pickRandomIndex(games, excludeId) {
  if (!games.length) return -1
  if (games.length === 1) return 0
  let idx
  let guard = 0
  do {
    idx = Math.floor(Math.random() * games.length)
    guard++
  } while (games[idx].id === excludeId && guard < 20)
  return idx
}

export function BeatTheModel() {
  const games = createMemo(() => {
    const data = beatTheModelCandidates.error ? undefined : beatTheModelCandidates()
    return data?.games ?? []
  })

  const [currentId, setCurrentId] = createSignal(null)
  const [guess, setGuess] = createSignal(null)

  createEffect(() => {
    const list = games()
    if (list.length && currentId() == null) {
      setCurrentId(list[pickRandomIndex(list, null)]?.id ?? null)
    }
  })

  const current = createMemo(() => games().find(g => g.id === currentId()) ?? null)
  const actualTier = createMemo(() => dramaTier(current()?.drama_peak) || 'cold')

  function makeGuess(tier) {
    if (guess() || !current()) return
    setGuess(tier)
    recordGuess(tier === actualTier())
  }

  function nextGame() {
    const list = games()
    const idx = pickRandomIndex(list, current()?.id)
    setCurrentId(list[idx]?.id ?? null)
    setGuess(null)
  }

  const accuracyPct = createMemo(() => (stats().total ? Math.round((stats().correct / stats().total) * 100) : null))

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Beat the Model</span>
        <button class={styles.refreshBtn} onClick={refetchBeatTheModelCandidates} aria-label="refresh">↻</button>
      </header>
      <p class={styles.note}>
        Guess a real archived game's drama tier before it's revealed. Retrospective only, per this
        project's own archived-data-only rule for drama scores -- not a live prediction.
      </p>

      <div class={styles.scoreboard}>
        <span class={styles.scoreItem}>{stats().correct}/{stats().total} correct</span>
        <Show when={accuracyPct() != null}><span class={styles.scoreItem}>{accuracyPct()}%</span></Show>
        <span class={styles.scoreItem}>streak {stats().streak}</span>
        <span class={styles.scoreItem}>best {stats().bestStreak}</span>
        <Show when={stats().total > 0}>
          <button class={styles.resetBtn} onClick={resetStats}>reset</button>
        </Show>
      </div>

      <Show when={beatTheModelCandidates.error}>
        <p class={styles.error}>{String(beatTheModelCandidates.error)}</p>
      </Show>

      <Show when={!beatTheModelCandidates.error}>
        <Show when={current()} fallback={<p class={styles.loading}>Loading…</p>}>
          <div class={styles.game}>
            <div class={styles.matchupRow}>
              <span class={styles.matchup}>{current().away} @ {current().home}</span>
              <span class={styles.score}>{current().away_score}–{current().home_score}</span>
            </div>
            <p class={styles.sportDate}>{current().sport} · {current().date}</p>

            <Show when={!guess()}>
              <div class={styles.tierRow}>
                <For each={TIERS}>
                  {(tier) => (
                    <button class={`${styles.tierBtn} ${styles[tier]}`} onClick={() => makeGuess(tier)}>
                      {tier}
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <Show when={guess()}>
              <div class={styles.reveal}>
                <p class={guess() === actualTier() ? styles.correct : styles.incorrect}>
                  You guessed {guess()}. Real tier: {dramaLabel(current().drama_peak) || '○'} {actualTier()} ({current().drama_peak} points).
                  {guess() === actualTier() ? ' Beat the model.' : ' Missed it.'}
                </p>
                <button class={styles.nextBtn} onClick={nextGame}>Next game →</button>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  )
}
