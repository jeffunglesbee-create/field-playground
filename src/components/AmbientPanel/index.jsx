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
