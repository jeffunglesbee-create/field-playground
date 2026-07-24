import { Show, For, Switch, Match, createMemo } from 'solid-js'
import { deskData } from '../../data/relay'
import styles from './DeskCard.module.css'

function Skeleton() {
  return (
    <div class={styles.skeleton}>
      <div class={`${styles.bar} ${styles.wide}`} />
      <div class={`${styles.bar} ${styles.medium}`} />
      <div class={`${styles.bar} ${styles.wide}`} />
      <div class={`${styles.bar} ${styles.narrow}`} />
      <div class={`${styles.bar} ${styles.medium}`} />
    </div>
  )
}

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

function GameRow(props) {
  const g = () => props.game
  const status = () => gameStatus(g())
  const scoreStr = () => `${g().away_score}–${g().home_score}`

  return (
    <div class={styles.gameRow}>
      <span class={`${styles.statusDot} ${styles[status()]}`} />
      <span class={styles.matchup}>{g().away} @ {g().home}</span>
      <span class={styles.scoreArea}>
        <Switch>
          <Match when={status() === 'pre'}>
            <span class={styles.pre}>—</span>
          </Match>
          <Match when={status() === 'live'}>
            <span class={styles.liveScore}>{scoreStr()}</span>
          </Match>
          <Match when={status() === 'final'}>
            <span class={styles.finalScore}>{scoreStr()}</span>
            <span class={styles.badge}>F</span>
          </Match>
          <Match when={status() === 'final_ot'}>
            <span class={styles.finalScore}>{scoreStr()}</span>
            <span class={styles.badge}>F/OT</span>
          </Match>
        </Switch>
      </span>
      <Show when={g().venue}>
        <span class={styles.venue}>{g().venue}</span>
      </Show>
    </div>
  )
}

function SportGroup(props) {
  return (
    <div class={styles.sportGroup}>
      <div class={styles.sportLabel}>{props.sport}</div>
      <For each={props.games}>{game => <GameRow game={game} />}</For>
    </div>
  )
}

function Content(props) {
  const allGames = createMemo(() => [
    ...(props.data.games?.regular ?? []),
    ...(props.data.games?.postseason ?? []),
  ])

  const grouped = createMemo(() => {
    const map = {}
    for (const g of allGames()) {
      if (!map[g.sport]) map[g.sport] = []
      map[g.sport].push(g)
    }
    return Object.entries(map)
  })

  return (
    <div>
      <header class={styles.header}>
        <span class={styles.label}>Desk</span>
        <span class={styles.dateMeta}>{props.data.date}</span>
      </header>

      <Show when={grouped().length} fallback={<p class={styles.empty}>No games today.</p>}>
        <div class={styles.gameList}>
          <For each={grouped()}>
            {([sport, games]) => <SportGroup sport={sport} games={games} />}
          </For>
        </div>
      </Show>
    </div>
  )
}

export function DeskCard() {
  return (
    <div class={styles.root}>
      <Switch>
        <Match when={deskData.loading}><Skeleton /></Match>
        <Match when={deskData.error}>
          <p class={styles.error}>{String(deskData.error)}</p>
        </Match>
        <Match when={deskData()}>
          {data => <Content data={data()} />}
        </Match>
      </Switch>
    </div>
  )
}
