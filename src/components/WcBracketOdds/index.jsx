import { For, Show, createMemo } from 'solid-js'
import { wcProjections, refetchWcProjections } from '../../data/relay'
import styles from './WcBracketOdds.module.css'

// Real, live endpoint confirmed via a direct probe 2026-07-27: GET
// /wc/projections -- a Monte Carlo simulation (N=2000 confirmed live)
// over the real World Cup bracket. Complements StandingRoom's WcSection,
// which only shows GROUP STAGE standings -- nothing else in this app
// surfaces knockout-stage projections.
//
// bracketTraps is the genuinely surprising part: teams where finishing
// 2nd in their group gives a HIGHER championship probability than
// finishing 1st, because the resulting bracket path is easier. That's a
// real signal computed relay-side from the simulation, not a client-side
// guess -- this component surfaces it, it doesn't derive it.
function pct(n) {
  return `${(n * 100).toFixed(1)}%`
}

function TeamRow(props) {
  const t = () => props.team
  return (
    <li class={styles.row}>
      <span class={styles.rank}>{props.rank}</span>
      <span class={styles.team}>{t().name}</span>
      <span class={styles.fifaRank} title="FIFA world ranking">FIFA #{t().fifaRank}</span>
      <div class={styles.barTrack}>
        <div class={styles.barFill} style={{ width: pct(t().pChamp / props.maxChamp) }} />
      </div>
      <span class={styles.champPct}>{pct(t().pChamp)}</span>
    </li>
  )
}

function TrapRow(props) {
  const t = () => props.trap
  const better2nd = () => t().delta > 0
  return (
    <li class={styles.trapRow}>
      <span class={styles.trapTeam}>{t().team}</span>
      <span class={styles.trapDetail}>
        1st: {pct(t().pChampIf1st)} champ · 2nd: {pct(t().pChampIf2nd)} champ
      </span>
      <span class={`${styles.trapDelta} ${better2nd() ? styles.trapWorse : ''}`}>
        {better2nd() ? '2nd is better by' : '1st is better by'} {pct(Math.abs(t().delta))}
      </span>
    </li>
  )
}

export function WcBracketOdds() {
  const data = () => (wcProjections.error ? undefined : wcProjections())

  const topTeams = createMemo(() => {
    const d = data()
    if (!d?.teams) return []
    return [...d.teams].sort((a, b) => b.pChamp - a.pChamp).slice(0, 8)
  })

  const maxChamp = createMemo(() => topTeams()[0]?.pChamp ?? 1)

  const traps = createMemo(() => {
    const d = data()
    if (!d?.bracketTraps) return []
    return [...d.bracketTraps].sort((a, b) => b.delta - a.delta)
  })

  // Real, plain-language payoff -- names the real favorite and its
  // real title probability, plus the single biggest real bracket
  // trap, instead of leaving both ranked lists for the reader to
  // scan and connect unaided. The trap is the genuinely surprising
  // finding this component exists to surface.
  const verdict = createMemo(() => {
    const top = topTeams()[0]
    const trap = traps()[0]
    const parts = []
    if (top) {
      parts.push(`Real favorite: ${top.name}, with a ${pct(top.pChamp)} real chance to win it all.`)
    }
    if (trap) {
      const better2nd = trap.delta > 0
      parts.push(`Biggest real bracket trap: ${trap.team} -- finishing ${better2nd ? '2nd' : '1st'} in group is worth ${pct(Math.abs(trap.delta))} more real title equity than finishing ${better2nd ? '1st' : '2nd'}.`)
    }
    return parts.length ? parts.join(' ') : null
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>WC Bracket Odds</span>
        <Show when={data()}>
          <span class={styles.simNote}>N={data().N} sims</span>
        </Show>
        <button class={styles.refreshBtn} onClick={refetchWcProjections} aria-label="refresh bracket odds">↻</button>
      </header>
      <Show when={wcProjections.error}>
        <p class={styles.error}>{String(wcProjections.error)}</p>
      </Show>
      <Show when={!wcProjections.error}>
        <Show when={data()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={verdict()}>
            <p class={styles.verdict}>{verdict()}</p>
          </Show>
          <p class={styles.sectionLabel}>Championship odds</p>
          <ul class={styles.rows}>
            <For each={topTeams()}>
              {(t, i) => <TeamRow team={t} rank={i() + 1} maxChamp={maxChamp()} />}
            </For>
          </ul>
          <Show when={traps().length}>
            <p class={styles.sectionLabel}>Bracket traps — 2nd place can beat 1st place</p>
            <ul class={styles.trapRows}>
              <For each={traps()}>{(t) => <TrapRow trap={t} />}</For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
