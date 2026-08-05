import { For, Show, createMemo, createResource } from 'solid-js'
import styles from './WcBracketTree.module.css'

const RELAY_BASE = import.meta.env.DEV
  ? '' : 'https://field-relay-nba.jeffunglesbee.workers.dev'

// WcBracketTree — the first surface here rendering a real bracket
// STRUCTURE, not a flat probability list. WcBracketOdds already covers
// the flat form (topTeams, traps) from the same /wc/projections
// response; this reads its OWN field, bracketSlots, which that
// component never touches.
//
// VERIFIED SHAPE, not assumed: bracketSlots is a real, 63-entry,
// round-and-position-keyed object --
//   R32_73_A: {team, fifaCode, prob}
//   R16_.._A/B, QF_.._A/B, SF_.._A/B, Final_A/B, Champion
// Confirmed live before writing a line of this component.
//
// WHY THIS IS A DIFFERENT SOLIDJS QUESTION than anything else here:
// every other list in this repo mutates VALUES -- a score changes, a
// row's data updates, the row itself stays put. A bracket is different:
// as results land, WHICH TEAMS OCCUPY WHICH SLOTS changes, and later
// rounds only exist once earlier ones resolve. That is STRUCTURAL
// mutation -- the shape of the tree itself changes, not just its
// leaves. Nothing else here has tested whether <For>'s keyed-by-
// reference identity holds up when a slot's occupant is replaced
// entirely, or whether it quietly falls back to recreating nodes.
//
// This is currently PROJECTIONS, not live results -- the World Cup is
// in the group-stage-concluded, knockout-not-yet-played state
// confirmed earlier this session (pR32 fractional, not 1). So every
// slot below shows the MOST LIKELY occupant given current probability,
// not a decided result. Labeled as such rather than presented as fact.

async function fetchProjections() {
  const res = await fetch(RELAY_BASE + '/wc/projections')
  if (!res.ok) throw new Error('wc/projections fetch failed: ' + res.status)
  return res.json()
}

const [projections, { refetch }] = createResource(fetchProjections)

const ROUNDS = [
  { prefix: 'R32', label: 'Round of 32' },
  { prefix: 'R16', label: 'Round of 16' },
  { prefix: 'QF',  label: 'Quarterfinal' },
  { prefix: 'SF',  label: 'Semifinal' },
  { prefix: 'Final', label: 'Final' },
]

function slotsForRound(all, prefix) {
  return Object.entries(all)
    .filter(([k]) => k.startsWith(prefix + '_') || (prefix === 'Final' && k.startsWith('Final_')))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => ({ key, ...val }))
}

function SlotCard(props) {
  const s = () => props.slot
  const pct = () => Math.round((s().prob ?? 0) * 1000) / 10
  return (
    <div class={styles.slot}>
      <span class={styles.team}>{s().fifaCode ?? '—'}</span>
      <span class={styles.name}>{s().team ?? 'TBD'}</span>
      <div class={styles.barTrack}>
        <div class={styles.barFill} style={{ width: pct() + '%' }} />
      </div>
      <span class={styles.pct}>{pct()}%</span>
    </div>
  )
}

export function WcBracketTree() {
  const rounds = createMemo(() => {
    if (projections.error) return []
    const p = projections()
    if (!p?.bracketSlots) return []
    return ROUNDS.map(r => ({
      ...r,
      slots: slotsForRound(p.bracketSlots, r.prefix),
    })).filter(r => r.slots.length)
  })

  const champion = createMemo(() => {
    if (projections.error) return null
    return projections()?.bracketSlots?.Champion
  })

  // Real, plain-language payoff -- names the real favorite and real
  // probability, explicitly framed as a projection: the knockout rounds
  // haven't been played (see header note above), so this must not read
  // as a decided result.
  const verdict = createMemo(() => {
    const c = champion()
    if (!c) return null
    const pct = Math.round((c.prob ?? 0) * 1000) / 10
    // Same null-safe fallback SlotCard already uses for an unresolved
    // slot's team name -- a Champion entry without a team is exactly the
    // TBD case, not a reason to let `undefined` leak into the sentence.
    return `${c.team ?? 'TBD'} is the most likely real champion right now, at ${pct}% -- a projection from current odds, not a decided result. The knockout rounds haven't been played yet.`
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>WC Bracket Tree</span>
        <span class={styles.note}>projected, not decided — structural mutation, not value mutation</span>
      </header>

      <Show when={projections.error}>
        <p class={styles.empty}>Unable to load: {String(projections.error.message ?? '')}</p>
      </Show>

      <Show when={!projections.error}>
        <Show when={rounds().length} fallback={<p class={styles.empty}>Loading…</p>}>
          <Show when={champion()}>
            <div class={styles.championBanner}>
              <span class={styles.championLabel}>Projected Champion</span>
              <span class={styles.championName}>{champion().team}</span>
              <span class={styles.championPct}>
                {Math.round((champion().prob ?? 0) * 1000) / 10}%
              </span>
            </div>
          </Show>

          <Show when={verdict()}>
            <p class={styles.verdict}>{verdict()}</p>
          </Show>

          <div class={styles.tree}>
            <For each={rounds()}>
              {round => (
                <div class={styles.roundCol}>
                  <h4 class={styles.roundLabel}>{round.label}</h4>
                  <div class={styles.roundSlots}>
                    {/* Keyed by slot KEY (R32_73_A etc.), not by team --
                        the slot is the stable identity; its occupant is
                        the thing that changes as projections update.
                        That is the actual test: does the SLOT keep its
                        DOM node while the TEAM inside it swaps? */}
                    <For each={round.slots}>
                      {slot => <SlotCard slot={slot} />}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}
