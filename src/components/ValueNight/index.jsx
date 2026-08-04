import { For, Show, createMemo } from 'solid-js'
import { fplBootstrap, refetchFplBootstrap } from '../../data/relay'
import { rankByValue, MIN_MINUTES } from '../../data/valueNight'
import styles from './ValueNight.module.css'

// Value Night -- real fiduciary/economics angle, distinct from this
// repo's existing broadcast-cost surfaces (Arbitrage, TonightsPick):
// real fantasy-football points delivered per real £ of transfer cost,
// using FPL's real bootstrap-static fields. Field shape confirmed live
// via a direct CI probe before this was built (see
// scripts/probe-fpl-elements-shape.mjs).
const RESULT_LIMIT = 15

export function ValueNight() {
  const ranked = createMemo(() => {
    const data = fplBootstrap.error ? undefined : fplBootstrap()
    if (!data) return []
    return rankByValue(data).slice(0, RESULT_LIMIT)
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Value Night</span>
        <button class={styles.refreshBtn} onClick={refetchFplBootstrap} aria-label="refresh">↻</button>
      </header>
      <p class={styles.note}>
        Real FPL points delivered per real £ of transfer cost -- points ÷ price, minimum {MIN_MINUTES} real
        minutes played (10 full matches) to filter out small-sample noise.
      </p>

      <Show when={fplBootstrap.error}>
        <p class={styles.error}>{String(fplBootstrap.error)}</p>
      </Show>

      <Show when={!fplBootstrap.error}>
        <Show when={fplBootstrap()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={ranked().length} fallback={<p class={styles.empty}>No players meet the minimum-minutes threshold yet.</p>}>
            <ol class={styles.rows}>
              <For each={ranked()}>
                {(p, i) => (
                  <li class={styles.row}>
                    <span class={styles.rank}>#{i() + 1}</span>
                    <div class={styles.rowBody}>
                      <div class={styles.rowMain}>
                        <span class={styles.name}>{p.name}</span>
                        <span class={styles.posBadge}>{p.position}</span>
                        <span class={styles.team}>{p.team}</span>
                      </div>
                      <div class={styles.statLine}>
                        <span class={styles.valueBadge}>{p.value.toFixed(2)} pts/£m</span>
                        <span class={styles.statNote}>{p.points} pts · £{p.costM.toFixed(1)}m · {p.minutes} min</span>
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
