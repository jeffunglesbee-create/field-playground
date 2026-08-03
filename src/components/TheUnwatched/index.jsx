import { For, Show, createMemo } from 'solid-js'
import { unwatchedCandidates, refetchUnwatchedCandidates } from '../../data/relay'
import { dramaLabel } from '../DeskCard'
import { analyzeGameArc } from '../../data/dramaArcAnalysis'
import styles from './TheUnwatched.module.css'

// The Unwatched — the inverse of this whole project's thesis. Every
// other drama surface here (DramaLeaderboard, TonightsPick,
// DramaSoundscape) trusts drama_peak/drama_arc as a signal of what's
// worth watching. This one holds the scoring model accountable to
// itself: games where the EARLY portion of its own real arc stayed
// low (the model would have called it boring if you'd stopped
// watching then) but the game's real final peak turned genuinely
// dramatic anyway.
//
// VALIDATED AGAINST REAL DATA BEFORE BUILDING (not assumed): today's
// #1 real "Most Dramatic Game" (Tampa Bay Rays @ Baltimore Orioles,
// drama_peak=74) was checked by hand against its own real arc
// (outbox/drama-leaderboard-wp-movement-probe-2026-08-01T01-46-34-
// 126Z.txt) -- its first 20% never exceeds 52 ('warm' tier), and it
// doesn't cross into 'hot' (>=60) until 62% through the real game.
// That's a real, concrete example of exactly the pattern this
// component surfaces, confirmed on real numbers before any UI existed.
//
// dramaLabel reused verbatim from DeskCard (jubilant-bassoon's own
// real thresholds, already ported there) -- not re-derived, so
// "warm"/"hot"/"fire" mean the same thing here as everywhere else in
// this app. The early-window/gap math itself lives in
// src/data/dramaArcAnalysis.js, shared with HallOfSurprises (extracted
// 2026-08-03) rather than kept as a second independent copy.
//
// EARLY WINDOW: first 20% of the real arc, floor of 5 points so very
// short arcs still get a meaningful sample. This is an honest,
// disclosed choice, not a claim that 20% is how any real prediction
// system actually works -- drama_peak/drama_arc themselves are
// archived post-hoc data (RUWT/ADR-002: never live), so this is a
// retrospective "if you judged early, you'd have been wrong" framing,
// not a live forecast.

export function TheUnwatched() {
  const analyzed = createMemo(() => {
    const data = unwatchedCandidates.error ? undefined : unwatchedCandidates()
    const games = data?.games ?? []
    return games.map(analyzeGameArc).filter(Boolean)
  })

  const unwatched = createMemo(() =>
    [...analyzed()].filter(a => a.isUnwatched).sort((a, b) => b.gap - a.gap)
  )

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>The Unwatched</span>
        <button class={styles.refreshBtn} onClick={refetchUnwatchedCandidates} aria-label="refresh">↻</button>
      </header>
      <p class={styles.note}>
        Games the scoring system's own early arc called {dramaLabel(50)} warm or colder — that would
        have looked skippable if you'd stopped watching — but that went genuinely {dramaLabel(70)} hot
        or {dramaLabel(85)} fire by the end. The model's honest ledger of what it almost told people
        to skip.
      </p>

      <Show when={unwatchedCandidates.error}>
        <p class={styles.error}>{String(unwatchedCandidates.error)}</p>
      </Show>

      <Show when={!unwatchedCandidates.error}>
        <Show when={unwatchedCandidates()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={unwatched().length} fallback={<p class={styles.empty}>No unwatched games in today's sample — every early read matched where the game ended up.</p>}>
            <ul class={styles.rows}>
              <For each={unwatched()}>
                {u => (
                  <li class={styles.row}>
                    <div class={styles.rowMain}>
                      <span class={styles.matchup}>{u.game.away} @ {u.game.home}</span>
                      <span class={styles.score}>{u.game.away_score}–{u.game.home_score}</span>
                    </div>
                    <div class={styles.arcLine}>
                      <span class={`${styles.tierBadge} ${styles[u.earlyTier]}`}>
                        {dramaLabel(u.earlyPeak) || '○'} {u.earlyTier} early
                      </span>
                      <span class={styles.arrow}>→</span>
                      <span class={`${styles.tierBadge} ${styles[u.finalTier]}`}>
                        {dramaLabel(u.finalPeak)} {u.finalTier} final
                      </span>
                    </div>
                    <Show when={u.flipPercent != null}>
                      <p class={styles.flipNote}>
                        Didn't cross into "hot" until {u.flipPercent}% through the game — real gap of {u.gap} points from its own early peak.
                      </p>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
