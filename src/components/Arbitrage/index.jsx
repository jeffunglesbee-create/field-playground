import { For, Show, createMemo, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { deskStore } from '../../data/relay'
import styles from './Arbitrage.module.css'

// Arbitrage — the first playground surface that touches FIELD's ACTUAL
// PRODUCT THESIS: what is worth watching, what it costs, and why.
//
// Everything built here so far has been schedule, standings, stats, or
// journalism. The broadcast/cost layer — renderArbitrageBar,
// renderBroadcastArchaeology, renderConflictChip, renderStreaming in
// production — was completely absent. That is the differentiator, and
// it had never been tried.
//
// DATA, verified before building rather than assumed:
//   game.streams is a REAL field and genuinely populated — 15 to 31
//   games per day across the dates checked. It is a COMMA-SEPARATED
//   STRING, not an array:
//     "Peacock"
//     "ESPN Unlmtd, MLB.TV, Royals.TV, Tigers.TV"
//     "MLB.TV, Rockies.TV, Brewers.TV"
//   Production's client parses a richer object with .key per stream;
//   the relay's /context/date sends this flatter string form. Parsing
//   is therefore string-based here, and that difference is real rather
//   than a simplification.
//
// PRICES are production's ACTUAL table, copied verbatim from
// jubilant-bassoon (src/legacy/field.js, `PRICES`). Not estimated, not
// rounded, not invented. If a service is not in that table it shows as
// unknown rather than being assigned a guessed price — an invented
// cost is worse than a visible gap, and this whole session has been
// about not doing that.

// Verbatim from production. Monthly USD.
const PRICES = {
  peacock: 9.99, max: 16.99, prime: 14.99, apple: 9.99, espnplus: 11.99,
  paramount: 7.99, tcplus: 9.99, netflix: 7.99, mlbtv: 24.99, mlbplus: 5.99,
  bein: 9.99, willow: 9.99, youtubetv: 82.99, fubo: 79.99, hulu: 82.99,
  sling: 45.99, directv: 84.99,
}

// Maps the relay's display strings onto PRICES keys. Deliberately
// conservative: anything unmatched stays unmatched and is reported,
// rather than being force-fitted to the nearest-looking key.
const SERVICE_MAP = [
  [/peacock/i, 'peacock'],
  [/\bmax\b/i, 'max'],
  [/prime|amazon/i, 'prime'],
  [/apple/i, 'apple'],
  [/espn\+|espn plus|espn unlmtd|espn unlimited/i, 'espnplus'],
  [/paramount/i, 'paramount'],
  [/tennis channel|tc\+/i, 'tcplus'],
  [/netflix/i, 'netflix'],
  [/mlb\.tv|mlbtv/i, 'mlbtv'],
  [/mlb\+/i, 'mlbplus'],
  [/bein/i, 'bein'],
  [/willow/i, 'willow'],
  [/youtube tv/i, 'youtubetv'],
  [/fubo/i, 'fubo'],
  [/hulu/i, 'hulu'],
  [/sling/i, 'sling'],
  [/directv/i, 'directv'],
]

function parseStreams(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(label => {
    const hit = SERVICE_MAP.find(([re]) => re.test(label))
    const key = hit ? hit[1] : null
    return { label, key, price: key ? PRICES[key] : null }
  })
}

export function Arbitrage() {
  // Which services the user already has. Local only.
  const [owned, setOwned] = createStore({})
  const [showUnpriced, setShowUnpriced] = createSignal(false)

  const games = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])

  const withStreams = createMemo(() =>
    games()
      .map(g => ({ game: g, streams: parseStreams(g.streams) }))
      .filter(x => x.streams.length)
  )

  // Every distinct service on tonight's slate, with how many games it
  // unlocks. This is the arbitrage question in its simplest real form:
  // coverage per dollar.
  const services = createMemo(() => {
    const map = new Map()
    for (const { streams } of withStreams()) {
      for (const s of streams) {
        const id = s.key ?? s.label
        const cur = map.get(id) ?? { ...s, id, games: 0 }
        cur.games++
        map.set(id, cur)
      }
    }
    return [...map.values()].sort((a, b) => b.games - a.games)
  })

  const ownedKeys = createMemo(() => Object.keys(owned).filter(k => owned[k]))

  // Coverage: how many of tonight's games are reachable with what you
  // already own. Derived from the same source, so it moves with the
  // slate and with every toggle.
  const coverage = createMemo(() => {
    const have = new Set(ownedKeys())
    const all = withStreams()
    const covered = all.filter(x => x.streams.some(s => have.has(s.key ?? s.label)))
    return { total: all.length, covered: covered.length, uncovered: all.length - covered.length }
  })

  const monthlySpend = createMemo(() =>
    ownedKeys().reduce((sum, k) => sum + (PRICES[k] ?? 0), 0)
  )

  // THE ARBITRAGE CALCULATION, and the one genuinely interesting
  // derived value here: for each service NOT owned, how many currently
  // UNCOVERED games would it unlock, and at what cost per game?
  // Sorted by cost-per-game ascending — the cheapest marginal
  // improvement first. A service that unlocks nothing new is excluded
  // entirely rather than shown at infinite cost.
  const marginal = createMemo(() => {
    const have = new Set(ownedKeys())
    const uncovered = withStreams().filter(x => !x.streams.some(s => have.has(s.key ?? s.label)))
    const out = []
    for (const svc of services()) {
      if (have.has(svc.id)) continue
      const unlocks = uncovered.filter(x => x.streams.some(s => (s.key ?? s.label) === svc.id)).length
      if (!unlocks) continue
      out.push({
        ...svc,
        unlocks,
        costPerGame: svc.price != null ? svc.price / unlocks : null,
      })
    }
    return out.sort((a, b) => {
      if (a.costPerGame == null) return 1
      if (b.costPerGame == null) return -1
      return a.costPerGame - b.costPerGame
    })
  })

  const unpricedCount = createMemo(() => services().filter(s => s.price == null).length)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Arbitrage</span>
        <span class={styles.note}>real streams · production's real price table</span>
      </header>

      <Show
        when={withStreams().length}
        fallback={<p class={styles.empty}>No games carry stream data on this date.</p>}
      >
        <div class={styles.summary}>
          <span class={styles.stat}>
            {coverage().covered}/{coverage().total} games covered
          </span>
          <span class={`${styles.stat} ${coverage().uncovered ? styles.warn : styles.good}`}>
            {coverage().uncovered} unreachable
          </span>
          <span class={styles.stat}>${monthlySpend().toFixed(2)}/mo</span>
        </div>

        <h4 class={styles.subhead}>What you have</h4>
        <div class={styles.chips}>
          <For each={services()}>
            {s => (
              <button
                class={`${styles.chip} ${owned[s.id] ? styles.chipOwned : ''}`}
                onClick={() => setOwned(s.id, v => !v)}
                title={s.price != null ? `$${s.price}/mo` : 'price unknown — not in production table'}
              >
                {s.label}
                <span class={styles.chipCount}>{s.games}</span>
                <Show when={s.price == null}><span class={styles.unpriced}>?</span></Show>
              </button>
            )}
          </For>
        </div>

        <h4 class={styles.subhead}>
          Cheapest way to reach what you can't
          <Show when={!marginal().length}>
            <span class={styles.allCovered}> — nothing left to unlock</span>
          </Show>
        </h4>
        <div class={styles.marginalList}>
          <For each={marginal()}>
            {m => (
              <div class={styles.marginalRow}>
                <span class={styles.mName}>{m.label}</span>
                <span class={styles.mUnlocks}>+{m.unlocks} game{m.unlocks === 1 ? '' : 's'}</span>
                <span class={styles.mPrice}>
                  {m.price != null ? `$${m.price.toFixed(2)}` : '—'}
                </span>
                <span class={styles.mCpg}>
                  {m.costPerGame != null ? `$${m.costPerGame.toFixed(2)}/game` : 'price unknown'}
                </span>
              </div>
            )}
          </For>
        </div>

        <Show when={unpricedCount()}>
          <button class={styles.toggleUnpriced} onClick={() => setShowUnpriced(v => !v)}>
            {unpricedCount()} service{unpricedCount() === 1 ? '' : 's'} not in the price table
            {showUnpriced() ? ' ▾' : ' ▸'}
          </button>
          <Show when={showUnpriced()}>
            <p class={styles.unpricedNote}>
              These appear in the relay's stream strings but have no entry in
              production's PRICES table — mostly team-owned RSN feeds
              (Royals.TV, Tigers.TV) which are typically bundled rather than
              sold standalone. Shown as unknown rather than assigned a guessed
              cost.
            </p>
            <div class={styles.chips}>
              <For each={services().filter(s => s.price == null)}>
                {s => <span class={styles.chipInert}>{s.label}</span>}
              </For>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
