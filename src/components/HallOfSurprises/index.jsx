import { For, Show, createMemo } from 'solid-js'
import { hallOfSurprisesCandidates, refetchHallOfSurprisesCandidates } from '../../data/relay'
import { analyzeGameArc } from '../../data/dramaArcAnalysis'
import { dramaLabel } from '../DeskCard'
import styles from './HallOfSurprises.module.css'

// Hall of Surprises -- a browsable hall-of-fame gallery ranked by the
// single biggest real gap between the scoring model's own early read
// and where a real archived game actually ended up. Same real signal
// TheUnwatched already validated (early-window tier vs drama_peak,
// shared math via src/data/dramaArcAnalysis.js, extracted 2026-08-03),
// but broader -- ranks the top real games from a 50-game sample by gap
// magnitude, not just the ones crossing TheUnwatched's binary "would
// you have skipped it" threshold -- and presented as a ranked showcase
// rather than a flagged ledger.
//
// HONEST SCOPING, checked before building rather than assumed: a
// mirror-image "hot early, fizzled by the end" direction was checked
// against a real, current 30-game sample (2026-08-03) and NOT found
// at first. That negative result held for two real, since-corrected
// reasons, not a genuine absence: (1) the underlying drama_arc data
// had a real computation bug (situational fields read from a
// nonexistent nested path, confirmed and fixed 2026-08-03) that made
// most of a game's arc collapse to a single flat value, and (2) the
// original check only sampled MLB's top 30 by drama_peak, which is
// structurally biased against finding this shape (a game that peaked
// early then cooled will almost always have a lower overall peak than
// one that built to a late climax, so it's under-represented in any
// peak-sorted cut). A corrected, multi-sport, wider-pool re-check
// (probe-hall-of-surprises-fizzle-check-v2.mjs, same day) found 5 real
// WNBA games matching the pattern. Both directions are now shown.
const RESULT_LIMIT = 15
const FIZZLE_LIMIT = 10
const MEDALS = ['🥇', '🥈', '🥉']

export function HallOfSurprises() {
  const ranked = createMemo(() => {
    const data = hallOfSurprisesCandidates.error ? undefined : hallOfSurprisesCandidates()
    const games = data?.games ?? []
    return games
      .map(analyzeGameArc)
      .filter(Boolean)
      .filter(a => a.gap > 0)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, RESULT_LIMIT)
  })

  const fizzled = createMemo(() => {
    const data = hallOfSurprisesCandidates.error ? undefined : hallOfSurprisesCandidates()
    const games = data?.games ?? []
    return games
      .map(analyzeGameArc)
      .filter(Boolean)
      .filter(a => a.isFizzle)
      .sort((a, b) => b.fizzleGap - a.fizzleGap)
      .slice(0, FIZZLE_LIMIT)
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Hall of Surprises</span>
        <button class={styles.refreshBtn} onClick={refetchHallOfSurprisesCandidates} aria-label="refresh">↻</button>
      </header>
      <p class={styles.note}>
        The biggest real gaps between a game's early read and where it actually ended up, ranked.
        Early doubt that turned into real drama below; games that peaked early then cooled off, above.
      </p>

      <Show when={hallOfSurprisesCandidates.error}>
        <p class={styles.error}>{String(hallOfSurprisesCandidates.error)}</p>
      </Show>

      <Show when={!hallOfSurprisesCandidates.error}>
        <Show when={hallOfSurprisesCandidates()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={fizzled().length}>
            <div class={styles.sectionLabel}>Peaked early, cooled off</div>
            <ol class={styles.rows}>
              <For each={fizzled()}>
                {(r, i) => (
                  <li class={styles.row}>
                    <span class={styles.rank}>#{i() + 1}</span>
                    <div class={styles.rowBody}>
                      <div class={styles.rowMain}>
                        <span class={styles.matchup}>{r.game.away} @ {r.game.home}</span>
                        <span class={styles.score}>{r.game.away_score}–{r.game.home_score}</span>
                      </div>
                      <div class={styles.arcLine}>
                        <span class={`${styles.tierBadge} ${styles[r.finalTier]}`}>
                          {dramaLabel(r.finalPeak)} {r.finalTier} peak
                        </span>
                        <span class={styles.arrow}>→</span>
                        <span class={`${styles.tierBadge} ${styles[r.lateTier]}`}>
                          {dramaLabel(r.lateMax) || '○'} {r.lateTier} late
                        </span>
                        <span class={styles.gapNote}>−{r.fizzleGap} pts</span>
                      </div>
                    </div>
                  </li>
                )}
              </For>
            </ol>
          </Show>

          <div class={styles.sectionLabel}>Early doubt, real drama</div>
          <Show when={ranked().length} fallback={<p class={styles.empty}>No surprises in today's sample.</p>}>
            <ol class={styles.rows}>
              <For each={ranked()}>
                {(r, i) => (
                  <li class={styles.row}>
                    <span class={styles.rank}>{MEDALS[i()] ?? `#${i() + 1}`}</span>
                    <div class={styles.rowBody}>
                      <div class={styles.rowMain}>
                        <span class={styles.matchup}>{r.game.away} @ {r.game.home}</span>
                        <span class={styles.score}>{r.game.away_score}–{r.game.home_score}</span>
                      </div>
                      <div class={styles.arcLine}>
                        <span class={`${styles.tierBadge} ${styles[r.earlyTier]}`}>
                          {dramaLabel(r.earlyPeak) || '○'} {r.earlyTier} early
                        </span>
                        <span class={styles.arrow}>→</span>
                        <span class={`${styles.tierBadge} ${styles[r.finalTier]}`}>
                          {dramaLabel(r.finalPeak)} {r.finalTier} final
                        </span>
                        <span class={styles.gapNote}>+{r.gap} pts</span>
                      </div>
                    </div>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
