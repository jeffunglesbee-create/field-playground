import { Show, For, createMemo, createSignal, createEffect } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { ambientData, deskStore } from '../../data/relay'
import { outcomes, setOutcome, clearOutcome, annotations, setAnnotation } from '../../data/outcomes'
import { picks, NON_MATCHUP_SPORTS } from '../PickEm'
import { setHighlightedGameId } from '../DeskCard'
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

// truth_is vs contradiction as an explicit two-sided card. Both fields
// confirmed real; rendering them as stated tension ("the editorial
// claim" / "the counter-signal") rather than two separate, unrelated
// blocks is the actual new thing here -- the data already existed, the
// posture of surfacing internal conflict explicitly didn't.
function TensionCard(props) {
  const t = () => props.truthIs
  const c = () => props.contradiction
  return (
    <Show when={t()?.headline || c()}>
      <div class={styles.tensionCard}>
        <Show when={t()?.headline}>
          <div class={styles.tensionSide}>
            <span class={styles.tensionLabel}>the editorial claim</span>
            <p class={styles.tensionText}>{t().headline}</p>
          </div>
        </Show>
        <Show when={c()}>
          <div class={`${styles.tensionSide} ${styles.tensionCounter}`}>
            <span class={styles.tensionLabel}>the counter-signal</span>
            <p class={styles.tensionText}>{c()}</p>
          </div>
        </Show>
      </div>
    </Show>
  )
}

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

// Prose as navigation. Scans morning_report for real team names (from
// today's own deskStore games, not a fixed list) and wraps matches in
// clickable spans -- tapping one highlights the matching DeskCard row
// via the exported setHighlightedGameId, a signal DeskCard itself owns
// and reads. Editorial copy becomes a navigation layer into the
// structured game grid, not just static text describing it.
function ProseReport(props) {
  const teamMap = createMemo(() => {
    const map = {}
    for (const g of props.games()) {
      if (g.home) map[g.home] = g.id
      if (g.away) map[g.away] = g.id
    }
    return map
  })

  const segments = createMemo(() => {
    const text = props.text
    const names = Object.keys(teamMap()).sort((a, b) => b.length - a.length) // longest first, avoids partial-name matches inside longer names
    if (!text || names.length === 0) return [{ text, gameId: null }]
    const pattern = new RegExp(`(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
    const parts = text.split(pattern)
    return parts.map(part => ({ text: part, gameId: teamMap()[part] ?? null }))
  })

  return (
    <p class={styles.morningReport} style={{ '--quality-sharpness': props.qualitySharpness }}>
      <For each={segments()}>
        {seg => seg.gameId ? (
          <span class={styles.teamLink} onClick={() => setHighlightedGameId(seg.gameId)}>{seg.text}</span>
        ) : (
          <>{seg.text}</>
        )}
      </For>
    </p>
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

  const todaysGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])
  const pickableGames = createMemo(() => todaysGames().filter(g => !NON_MATCHUP_SPORTS.has(g.sport?.toLowerCase())))
  const pickedCount = createMemo(() => pickableGames().filter(g => picks[g.id]).length)
  const allPicked = createMemo(() => pickableGames().length === 0 || pickedCount() === pickableGames().length)
  const picksRevealed = createMemo(() => allPicked() || manuallyRevealed())

  // Quality-as-texture: a continuous sharpness value derived from
  // quality_alert's real alert_count, not a discrete good/bad flag --
  // more alerts, softer rendering, ambient rather than a warning badge.
  // The badge above still exists too (some signals deserve to be
  // legible, not just felt) -- this is an additional, gentler layer.
  const qualitySharpness = createMemo(() => {
    const count = d().quality_alert?.alert_count ?? 0
    return Math.max(0.4, 1 - count * 0.05)
  })

  return (
    <div>
      <header class={styles.header}>
        <span class={styles.label}>Ambient</span>
        <span class={styles.timeMode} title="morning/midday/evening/late, drives what's emphasized below">{timeMode()}</span>
        <span class={styles.dateMeta}>{d().date} · recap through {d().recap_date}</span>
      </header>

      <QualityAlertBadge qualityAlert={d().quality_alert} />

      <SportOfWeekBanner sport={d().sport_of_week} />

      <TensionCard truthIs={d().truth_is} contradiction={d().contradiction} />

      <Show when={d().morning_report}>
        <ProseReport text={d().morning_report} games={todaysGames} qualitySharpness={qualitySharpness()} />
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
                  Lock your own PickEm picks first ({pickedCount()}/{pickableGames().length}) —
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
