import { Show, For, Switch, Match } from 'solid-js'
import { ambientData } from '../../data/relay'
import styles from './AmbientPanel.module.css'
import shared from '../shared.module.css'

function Skeleton() {
  return (
    <div class={shared.skeleton}>
      <div class={`${shared.bar} ${shared.wide}`} />
      <div class={`${shared.bar} ${shared.medium}`} />
      <div class={`${shared.bar} ${shared.wide}`} />
      <div class={`${shared.bar} ${shared.narrow}`} />
      <div class={`${shared.bar} ${shared.medium}`} />
    </div>
  )
}

function PickRow(props) {
  const p = () => props.pick
  return (
    <div class={styles.pickRow}>
      <div class={styles.pickHead}>
        <span class={`${shared.chip} ${styles.tier} ${styles['tier_' + String(p().tier).toLowerCase()]}`}>
          {p().tier}
        </span>
        <span class={styles.pickSport}>{p().sport}</span>
        <span class={styles.pickMatchup}>{p().away} @ {p().home}</span>
        <Show when={p().score}>
          <span class={styles.pickScore}>{p().score}</span>
        </Show>
      </div>
      <Show when={p().reasons?.length}>
        <div class={styles.reasons}>
          <For each={p().reasons}>{r => <span class={`${shared.chip} ${styles.reasonBadge}`}>{r}</span>}</For>
        </div>
      </Show>
    </div>
  )
}

/*
  Streak Board — reads record_streak_board (real win/loss streaks),
  deliberately NOT streak_board (FIELD's own journalism-quality signal —
  see Codex: streak-board-metric-mismatch). This is principle #5's first
  real test, not a hypothetical one: the label says "Streak Board," and
  it needs to actually mean win/loss streaks for that label to be honest.
  Naming checked before writing this, not after a screenshot caught it.
*/
function StreakChip(props) {
  const s = () => props.streak
  const icon = () => props.kind === 'hot' ? '🔥' : '🧊'
  const chipClass = () => props.kind === 'hot' ? styles.streakHot : styles.streakCold
  return (
    <span class={`${shared.chip} ${styles.streakChip} ${chipClass()}`}>
      {icon()} {s().team} × {s().streak}
    </span>
  )
}

function StreakBoard(props) {
  const rsb = () => props.data.record_streak_board
  const hot = () => rsb()?.hot ?? []
  const cold = () => rsb()?.cold ?? []

  return (
    <Show when={rsb() && !rsb().degraded && (hot().length || cold().length)}>
      <section class={styles.section}>
        <h3 class={styles.sectionLabel}>Streak Board</h3>
        <div class={styles.streakRow}>
          <For each={hot()}>{s => <StreakChip streak={s} kind="hot" />}</For>
          <For each={cold()}>{s => <StreakChip streak={s} kind="cold" />}</For>
        </div>
      </section>
    </Show>
  )
}

function Content(props) {
  const d = () => props.data
  return (
    <div>
      <header class={styles.header}>
        <span class={styles.label}>Ambient</span>
        <span class={styles.dateMeta}>{d().date} · recap through {d().recap_date}</span>
      </header>

      <Show when={d().morning_report}>
        <p class={styles.morningReport}>{d().morning_report}</p>
      </Show>

      <Show when={d().pick?.ranked?.length}>
        <section class={styles.section}>
          <h3 class={styles.sectionLabel}>Picks</h3>
          <div class={styles.pickList}>
            <For each={d().pick.ranked}>
              {pick => <PickRow pick={pick} />}
            </For>
          </div>
        </section>
      </Show>

      <StreakBoard data={d()} />
    </div>
  )
}

export function AmbientPanel() {
  return (
    <div class={styles.root}>
      <Switch>
        <Match when={ambientData.loading}><Skeleton /></Match>
        <Match when={ambientData.error}>
          <p class={styles.error}>{String(ambientData.error)}</p>
        </Match>
        <Match when={ambientData()}>
          {data => <Content data={data()} />}
        </Match>
      </Switch>
    </div>
  )
}
