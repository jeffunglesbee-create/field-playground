import { Show, For, createMemo, createSignal, createEffect } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { ambientData, deskStore } from '../../data/relay'
import { outcomes, setOutcome, clearOutcome, annotations, setAnnotation } from '../../data/outcomes'
import { picks } from '../PickEm'
import { useTimeOfDay } from '../../data/timeOfDay'
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

const [expanded, setExpanded] = createStore({})
function toggleExpand(gameId) {
  setExpanded(gameId, e => !e)
}

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

const [pickOrder, setPickOrder] = createStore([])
let dragIndex = null

function syncPickOrder(realIds) {
  const currentIds = [...pickOrder]
  const sameSet = currentIds.length === realIds.length && currentIds.every(id => realIds.includes(id))
  if (!sameSet) {
    setPickOrder(realIds)
  }
}

function handleDragStart(index) {
  dragIndex = index
}

function handleDrop(dropIndex) {
  if (dragIndex === null || dragIndex === dropIndex) return
  setPickOrder(produce(order => {
    const [moved] = order.splice(dragIndex, 1)
    order.splice(dropIndex, 0, moved)
  }))
  dragIndex = null
}

// "What would you have picked?" mode -- editorial Picks section stays
// collapsed until every one of today's DeskCard games has a PickEm
// prediction, so seeing which games are recapped as dramatic can't
// subtly bias what the user would otherwise predict. Once revealed, it
// stays revealed for the session -- this isn't meant to be a puzzle you
// re-lock, just a one-way sequencing of "commit, then compare."
const [manuallyRevealed, setManuallyRevealed] = createSignal(false)

function AnnotationInput(props) {
  const [draft, setDraft] = createSignal(annotations()[props.gameId] ?? '')
  return (
    <div class={styles.annotationRow} onClick={e => e.stopPropagation()}>
      <input
        type="text"
        class={styles.annotationInput}
        placeholder="note why (optional, private)"
        value={draft()}
        onInput={e => setDraft(e.currentTarget.value)}
        onBlur={() => setAnnotation(props.gameId, draft())}
      />
    </div>
  )
}

function PickRow(props) {
  const p = () => props.pick
  const result = () => outcomes()[p().game_id] ?? null
  const isExpanded = () => !!expanded[p().game_id]
  const isFocused = () => focusedIndex() === props.index
  const note = () => annotations()[p().game_id]

  const toggle = (val) => {
    if (result() === val) clearOutcome(p().game_id)
    else setOutcome(p().game_id, val, p().tier)
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
      draggable="true"
      onDragStart={() => handleDragStart(props.index)}
      onDragOver={e => e.preventDefault()}
      onDrop={() => handleDrop(props.index)}
    >
      <div
        class={styles.pickHead}
        onClick={() => toggleExpand(p().game_id)}
        role="button"
        tabIndex={0}
      >
        <span class={styles.dragHandle} title="drag to reorder">⠿</span>
        <span class={styles.expandIcon}>{isExpanded() ? '▾' : '▸'}</span>
        <span class={`${shared.chip} ${styles.tier} ${styles['tier_' + String(p().tier).toLowerCase()]}`}>
          {p().tier}
        </span>
        <span class={styles.pickSport}>{p().sport}</span>
        <span class={styles.pickMatchup}>{p().away} @ {p().home}</span>
        <Show when={note()}>
          <span class={styles.noteIcon} title={note()}>📝</span>
        </Show>
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
      <Show when={isExpanded()}>
        <Show when={p().reasons?.length}>
          <div class={styles.reasons}>
            <For each={p().reasons}>{r => <span class={`${shared.chip} ${styles.reasonBadge}`}>{r}</span>}</For>
          </div>
        </Show>
        <AnnotationInput gameId={p().game_id} />
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

// quality_alert is a GLOBAL/aggregate structure (alert_count, alerts[],
// brief) confirmed via the real live payload -- NOT a per-pick field.
// Surfaced here as a system-wide indicator, not a per-pick badge the
// data doesn't actually support.
function QualityAlertBadge(props) {
  const qa = () => props.qualityAlert
  return (
    <Show when={qa()?.alert_count}>
      <div class={styles.qualityAlert} title={qa().brief}>
        ⚡ {qa().alert_count} quality alerts (since {qa().since})
      </div>
    </Show>
  )
}

function Content(props) {
  const d = () => props.data
  const timeMode = useTimeOfDay()

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

  const serverPicks = () => d().pick?.ranked ?? []

  createEffect(() => {
    syncPickOrder(serverPicks().map(p => p.game_id))
  })

  const orderedPicks = createMemo(() => {
    const byId = {}
    for (const p of serverPicks()) byId[p.game_id] = p
    const ids = pickOrder.length ? pickOrder : serverPicks().map(p => p.game_id)
    return ids.map(id => byId[id]).filter(Boolean)
  })

  // "What would you have picked" gating -- today's real games (from
  // DeskCard's own deskStore, not editorial picks, since editorial
  // picks are already a recap, not the set of games available to
  // predict) vs. how many the user has actually predicted in PickEm.
  const todaysGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])
  const pickedCount = createMemo(() => todaysGames().filter(g => picks[g.id]).length)
  const allPicked = createMemo(() => todaysGames().length > 0 && pickedCount() === todaysGames().length)
  const picksRevealed = createMemo(() => allPicked() || manuallyRevealed())

  return (
    <div>
      <header class={styles.header}>
        <span class={styles.label}>Ambient</span>
        <span class={styles.timeMode} title="morning/midday/evening/late, drives what's emphasized below">{timeMode()}</span>
        <span class={styles.dateMeta}>{d().date} · recap through {d().recap_date}</span>
      </header>

      <QualityAlertBadge qualityAlert={d().quality_alert} />

      <SportOfWeekBanner sport={d().sport_of_week} />

      <TruthIsQuote truthIs={d().truth_is} />

      <ContradictionCard contradiction={d().contradiction} />

      <Show when={d().morning_report}>
        <p class={styles.morningReport}>{d().morning_report}</p>
      </Show>

      <Show when={orderedPicks().length}>
        <section class={`${styles.section} ${timeMode() === 'morning' ? styles.deemphasized : ''}`}>
          <div class={styles.sectionHeader}>
            <h3 class={styles.sectionLabel}>Picks</h3>
            <Show when={record().any}>
              <span class={styles.record}>{record().w}–{record().l}–{record().p}</span>
            </Show>
          </div>
          <Show
            when={picksRevealed()}
            fallback={
              <div class={styles.revealGate}>
                <p class={styles.revealText}>
                  Lock your own PickEm picks first ({pickedCount()}/{todaysGames().length}) —
                  editorial becomes a comparison, not a hint.
                </p>
                <button class={styles.revealBtn} onClick={() => setManuallyRevealed(true)}>
                  show anyway
                </button>
              </div>
            }
          >
            <div
              class={styles.pickList}
              tabIndex={0}
              onKeyDown={e => handlePickListKeyDown(e, orderedPicks().length)}
              onFocus={() => { if (focusedIndex() < 0) setFocusedIndex(0) }}
            >
              <For each={orderedPicks()}>
                {(pick, i) => <PickRow pick={pick} index={i()} />}
              </For>
            </div>
          </Show>
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
