import { Show, For, createMemo, createSignal, createEffect } from 'solid-js'
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
// real product value rather than as another mechanism test.
const [expanded, setExpanded] = createStore({})
function toggleExpand(gameId) {
  setExpanded(gameId, e => !e)
}

// Keyboard navigation. focusedIndex is a plain signal, not per-row
// state -- arrow keys need to know the whole list's shape to move
// between rows, which a row-local signal couldn't do on its own.
const [focusedIndex, setFocusedIndex] = createSignal(-1)
const rowRefs = []

function handlePickListKeyDown(e, count) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    setFocusedIndex(i => Math.min((i < 0 ? -1 : i) + 1, count - 1))
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    setFocusedIndex(i => Math.max(i - 1, 0))
  } else if (e.key === 'Enter' && focusedIndex() >= 0) {
    e.preventDefault()
    const row = rowRefs[focusedIndex()]
    if (row) row.dataset.gameId && toggleExpand(row.dataset.gameId)
  }
}

function PickRow(props) {
  const p = () => props.pick
  const result = () => outcomes()[p().game_id] ?? null
  const isExpanded = () => !!expanded[p().game_id]
  const isFocused = () => focusedIndex() === props.index

  const toggle = (val) => {
    if (result() === val) clearOutcome(p().game_id)
    else setOutcome(p().game_id, val)
  }

  let rowEl
  createEffect(() => {
    if (isFocused() && rowEl) {
      rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })

  return (
    <div
      class={`${styles.pickRow} ${isFocused() ? styles.pickRowFocused : ''}`}
      ref={el => { rowEl = el; rowRefs[props.index] = el }}
      data-game-id={p().game_id}
    >
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

function StreakPips(props) {
  const s = () => props.streak
  const letter = () => props.kind === 'hot' ? 'W' : 'L'
  const pipClass = () => props.kind === 'hot' ? styles.pipHot : styles.pipCold
  const count = () => Math.min(s().streak, 10)
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

  const picks = () => d().pick?.ranked ?? []

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

      <Show when={picks().length}>
        <section class={styles.section}>
          <div class={styles.sectionHeader}>
            <h3 class={styles.sectionLabel}>Picks</h3>
            <Show when={record().any}>
              <span class={styles.record}>{record().w}–{record().l}–{record().p}</span>
            </Show>
          </div>
          <div
            class={styles.pickList}
            tabIndex={0}
            onKeyDown={e => handlePickListKeyDown(e, picks().length)}
            onFocus={() => { if (focusedIndex() < 0) setFocusedIndex(0) }}
          >
            <For each={picks()}>
              {(pick, i) => <PickRow pick={pick} index={i()} />}
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
