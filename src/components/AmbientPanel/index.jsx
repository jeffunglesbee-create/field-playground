import { Show, For, createMemo } from 'solid-js'
import { createStore } from 'solid-js/store'
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

// Compact/expand per pick -- same store-keyed-by-stable-id pattern
// already proven (collapsed sport groups, watchlist), applied here for
// real product value rather than as another mechanism test: this
// pattern is trustworthy now, not a research question anymore.
const [expanded, setExpanded] = createStore({})
function toggleExpand(gameId) {
  setExpanded(gameId, e => !e)
}

function PickRow(props) {
  const p = () => props.pick
  const result = () => outcomes()[p().game_id] ?? null
  const isExpanded = () => !!expanded[p().game_id]

  const toggle = (val) => {
    if (result() === val) clearOutcome(p().game_id)
    else setOutcome(p().game_id, val)
  }

  return (
    <div class={styles.pickRow}>
      <div
        class={styles.pickHead}
        onClick={() => toggleExpand(p().game_id)}
        role="button"
        tabIndex={0}
      >
        <span class={styles.expandIcon}>{isExpanded() ? '▾' : '▸'}</span>
        <span class={`${shared.chip} ${styles.tier} ${styles['tier_' + String(p().tier).toLowerCase()]}`}>
          {p().tier}
        </span>
        <span class={styles.pickSport}>{p().sport}</span>
        <span class={styles.pickMatchup}>{p().away} @ {p().home}</span>
        <div class={styles.pickTrailing} onClick={e => e.stopPropagation()}>
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
      <Show when={isExpanded() && p().reasons?.length}>
        <div class={styles.reasons}>
          <For each={p().reasons}>{r => <span class={`${shared.chip} ${styles.reasonBadge}`}>{r}</span>}</For>
        </div>
      </Show>
    </div>
  )
}

// Pip row -- a "streak" IS a count of consecutive same-outcome games by
// definition (hot = N consecutive wins, cold = N consecutive losses),
// so the pip sequence is fully derivable from the existing real data --
// no invented per-game history needed, just streak.streak repeated
// pips of the one outcome letter that kind implies.
function StreakPips(props) {
  const s = () => props.streak
  const letter = () => props.kind === 'hot' ? 'W' : 'L'
  const pipClass = () => props.kind === 'hot' ? styles.pipHot : styles.pipCold
  const count = () => Math.min(s().streak, 10) // visual cap, real number still shown below
  return (
    <div class={styles.pipTeam}>
      <span class={styles.pipTeamName}>{s().team}</span>
      <div class={styles.pipRow}>
        <For each={Array.from({ length: count() })}>
          {() => <span class={`${styles.pip} ${pipClass()}`}>{letter()}</span>}
        </For>
        <Show when={s().streak > 10}>
          <span class={styles.pipOverflow}>+{s().streak - 10}</span>
        </Show>
      </div>
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
        <div class={styles.pipBoard}>
          <For each={hot()}>{s => <StreakPips streak={s} kind="hot" />}</For>
          <For each={cold()}>{s => <StreakPips streak={s} kind="cold" />}</For>
        </div>
      </section>
    </Show>
  )
}

// truth_is: real field, confirmed live (object: {type, headline,
// rarity_score, brief}).
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

// sport_of_week: real field, confirmed via relay source
// (recap.sport_of_week?.value) -- a plain string, not an object.
// Null on the date checked live, but the source confirms the real
// shape regardless of what any single day happens to contain.
function SportOfWeekBanner(props) {
  return (
    <Show when={props.sport}>
      <div class={styles.sportOfWeek}>
        <span class={styles.sportOfWeekLabel}>Sport of the Week</span>
        <span class={styles.sportOfWeekValue}>{props.sport}</span>
      </div>
    </Show>
  )
}

// contradiction: real field, confirmed via relay source
// (recap.contradiction?.brief_text) -- a plain string. Surfaced as an
// explicit warning-toned card instead of buried in prose, since the
// whole point of the field is flagging editorial tension, not hiding it.
function ContradictionCard(props) {
  return (
    <Show when={props.contradiction}>
      <div class={styles.contradictionCard}>
        <span class={styles.contradictionLabel}>⚠ Contradiction</span>
        <p class={styles.contradictionText}>{props.contradiction}</p>
      </div>
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

      <SportOfWeekBanner sport={d().sport_of_week} />

      <TruthIsQuote truthIs={d().truth_is} />

      <ContradictionCard contradiction={d().contradiction} />

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
