import { Show, For, createMemo } from 'solid-js'
import { ambientData } from '../../data/relay'
import { outcomes, setOutcome, clearOutcome } from '../../data/outcomes'
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
  const result = () => outcomes()[p().game_id] ?? null

  const toggle = (val) => {
    if (result() === val) clearOutcome(p().game_id)
    else setOutcome(p().game_id, val)
  }

  return (
    <div class={styles.pickRow}>
      <div class={styles.pickHead}>
        <span class={`${shared.chip} ${styles.tier} ${styles['tier_' + String(p().tier).toLowerCase()]}`}>
          {p().tier}
        </span>
        <span class={styles.pickSport}>{p().sport}</span>
        <span class={styles.pickMatchup}>{p().away} @ {p().home}</span>
        <div class={styles.pickTrailing}>
          <Show when={p().score}>
            <span class={styles.pickScore}>{p().score}</span>
          </Show>
          <div class={styles.outcomeGroup}>
            <For each={['W', 'L', 'P']}>
              {val => (
                <button
                  class={[
                    styles.outcomeBtn,
                    result() === val ? styles['outcome_' + val.toLowerCase()] : '',
                    result() && result() !== val ? styles.outcomeDim : '',
                  ].join(' ')}
                  onClick={() => toggle(val)}
                >
                  {val}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
      <Show when={p().reasons?.length}>
        <div class={styles.reasons}>
          <For each={p().reasons}>{r => <span class={`${shared.chip} ${styles.reasonBadge}`}>{r}</span>}</For>
        </div>
      </Show>
    </div>
  )
}

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

// truth_is: real field on the newspaper object, confirmed live before
// building (curl'd /analytics/newspaper -- it's an object, not a plain
// string: {type, headline, rarity_score, brief}, headline and brief
// were identical in the sample checked but aren't guaranteed to be).
// Renders headline specifically -- the shorter, more pull-quote-shaped
// of the two fields -- as a typeset callout, not buried in prose.
function TruthIsQuote(props) {
  const t = () => props.truthIs
  return (
    <Show when={t()?.headline}>
      <blockquote class={styles.truthQuote}>
        {t().headline}
      </blockquote>
    </Show>
  )
}

function Content(props) {
  const d = () => props.data

  const record = createMemo(() => {
    const ranked = d().pick?.ranked ?? []
    let w = 0, l = 0, p = 0
    for (const pick of ranked) {
      const o = outcomes()[pick.game_id]
      if (o === 'W') w++
      else if (o === 'L') l++
      else if (o === 'P') p++
    }
    return { w, l, p, any: w + l + p > 0 }
  })

  return (
    <div>
      <header class={styles.header}>
        <span class={styles.label}>Ambient</span>
        <span class={styles.dateMeta}>{d().date} · recap through {d().recap_date}</span>
      </header>

      <TruthIsQuote truthIs={d().truth_is} />

      <Show when={d().morning_report}>
        <p class={styles.morningReport}>{d().morning_report}</p>
      </Show>

      <Show when={d().pick?.ranked?.length}>
        <section class={styles.section}>
          <div class={styles.sectionHeader}>
            <h3 class={styles.sectionLabel}>Picks</h3>
            <Show when={record().any}>
              <span class={styles.record}>{record().w}–{record().l}–{record().p}</span>
            </Show>
          </div>
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
  // Was: <Switch><Match when={ambientData.loading}>. Same bug class as
  // DeskCard had, different trigger -- ambientData shares currentDate
  // with deskData, so navigating dates (not polling, AmbientPanel isn't
  // in that loop) would flip .loading and unmount the whole panel
  // unnecessarily on every date click. Fixed the same way: check the
  // resolved value's truthiness instead.
  return (
    <div class={styles.root}>
      <Show when={ambientData.error}>
        <p class={styles.error}>{String(ambientData.error)}</p>
      </Show>
      <Show when={!ambientData.error}>
        <Show when={ambientData()} fallback={<Skeleton />}>
          {data => <Content data={data()} />}
        </Show>
      </Show>
    </div>
  )
}
