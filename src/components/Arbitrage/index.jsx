import { For, Show, createMemo, createSignal, onMount, onCleanup } from 'solid-js'
import { deskStore } from '../../data/relay'
import { myServices, toggleMyService } from '../../data/myServices'
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
//
// OWNERSHIP: the first version tracked "what you own" as a local,
// ephemeral createStore({}) -- gone on remount, invisible to any other
// surface. Production has a real name and shape for this already: "My
// Services", an onboarding modal (confirmed via FIELD_Handoff against
// jubilant-bassoon's STANDARDS.md) gated behind a localStorage flag.
// `../../data/myServices` is that same concept done properly here --
// shared, persisted -- and this component's own toggle UI moved into an
// actual modal to match, rather than staying an always-visible inline
// chip row. TonightsPick reads the same store, so owning a service here
// changes what TonightsPick calls "already have it" there too.

// Verbatim from production. Monthly USD. Exported so other surfaces
// (TonightsPick) can price a stream without re-copying this table --
// two independently-maintained copies of "production's real prices"
// is exactly the kind of drift this session has been avoiding.
export const PRICES = {
  peacock: 9.99, max: 16.99, prime: 14.99, apple: 9.99, espnplus: 11.99,
  paramount: 7.99, tcplus: 9.99, netflix: 7.99, mlbtv: 24.99, mlbplus: 5.99,
  bein: 9.99, willow: 9.99, youtubetv: 82.99, fubo: 79.99, hulu: 82.99,
  sling: 45.99, directv: 84.99,
}

// Maps the relay's display strings onto PRICES keys. Deliberately
// conservative: anything unmatched stays unmatched and is reported,
// rather than being force-fitted to the nearest-looking key.
//
// Expanded 2026-07-28 after scripts/probe-streams-availability.mjs (run
// via .github/workflows/streams-availability-probe.yml) found this
// table was only resolving 325 of 1020 real label mentions (32%) --
// the other 68% split between team RSN feeds (already documented as
// deliberately unmatched, see the unpricedNote below) and major
// national networks this table had never covered at all: ESPN's
// linear/cable channel (distinct from ESPN+, already mapped), TBS,
// FS1, NBA TV, MLB Network, CNBC, Golf Channel, ION, NBCSN, Disney+,
// WNBA League Pass, TV Azteca, FOX Deportes, FOX One, and the four
// broadcast networks (FOX/CBS/NBC/ABC). Patterns below are anchored
// (^...$) wherever the bare national brand could otherwise collide
// with a same-named LOCAL affiliate call sign or regional feed also
// present in the real data (e.g. "FOX" must not match "Fox 5 WTTG" or
// "FOX Deportes"; "Sportsnet" must not match "Sportsnet LA", a
// Dodgers regional feed, not the Canadian national network). Local
// affiliate call signs themselves (KMSP-TV, WPIX, KING 5, ...) are
// deliberately NOT mapped -- there are effectively unbounded many,
// they're market-specific rather than a single ownable product, and
// mapping them would be exactly the over-fitting this table has
// avoided since it started.
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
  // -- major national networks, added 2026-07-28 --
  [/^espn$/i, 'espn'],
  [/^tbs$/i, 'tbs'],
  [/^fs1$/i, 'fs1'],
  [/nba tv/i, 'nbatv'],
  [/mlb net/i, 'mlbnetwork'],
  [/^cnbc$/i, 'cnbc'],
  [/golf chnl|golf channel/i, 'golfchannel'],
  [/^ion$/i, 'ion'],
  [/^nbcsn$/i, 'nbcsn'],
  [/disney\+/i, 'disneyplus'],
  [/wnba league pass/i, 'wnbaleaguepass'],
  [/tv azteca/i, 'tvazteca'],
  [/fox deportes/i, 'foxdeportes'],
  [/fox one/i, 'foxone'],
  [/^fox$/i, 'fox'],
  [/^cbs$/i, 'cbs'],
  [/^nbc$/i, 'nbc'],
  [/^abc$/i, 'abc'],
  [/^tsn$/i, 'tsn'],
  [/^sportsnet$/i, 'sportsnet'],
  [/^tva$/i, 'tva'],
]

// FOX, CBS, NBC, ABC are broadcast networks -- free over the air by US
// law, not a price this table doesn't happen to know. That's a third,
// honest category distinct from both PRICES (a real number) and
// "unmatched" (a real gap): this one is known, and it's $0. None of
// the newly-added cable-only nationals (ESPN linear, TBS, FS1, NBA TV,
// MLB Network, ...) get a PRICES entry either -- they're sold bundled
// into cable/live-TV packages (youtubetv, fubo, hulu, sling, directv,
// all already in PRICES), never standalone, so a standalone monthly
// number for them would be exactly the invented cost this table has
// never allowed.
const FREE_BROADCAST = new Set(['fox', 'cbs', 'nbc', 'abc'])

export function parseStreams(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(label => {
    const hit = SERVICE_MAP.find(([re]) => re.test(label))
    const key = hit ? hit[1] : null
    return { label, key, price: key ? PRICES[key] : null, free: key ? FREE_BROADCAST.has(key) : false }
  })
}

function MyServicesModal(props) {
  function handleKeydown(e) {
    if (e.key === 'Escape') props.onClose()
  }
  onMount(() => {
    window.addEventListener('keydown', handleKeydown)
    onCleanup(() => window.removeEventListener('keydown', handleKeydown))
  })

  return (
    <div class={styles.backdrop} onClick={props.onClose}>
      <div
        class={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="My Services"
        onClick={e => e.stopPropagation()}
      >
        <header class={styles.modalHeader}>
          <span class={styles.label}>My Services</span>
          <button class={styles.modalClose} onClick={props.onClose} aria-label="close">✕</button>
        </header>
        <p class={styles.note}>
          What you already subscribe to — shared with every surface that reads it, not just
          Arbitrage, and remembered across visits.
        </p>
        <div class={styles.chips}>
          <For each={props.services}>
            {s => (
              <button
                class={`${styles.chip} ${myServices[s.id] ? styles.chipOwned : ''} ${s.free ? styles.chipFree : ''}`}
                onClick={() => toggleMyService(s.id)}
                title={s.free ? 'free over-the-air broadcast' : s.price != null ? `$${s.price}/mo` : 'price unknown — not in production table'}
              >
                {s.label}
                <span class={styles.chipCount}>{s.games}</span>
                <Show when={s.free}><span class={styles.freeTag}>free</span></Show>
                <Show when={s.price == null && !s.free}><span class={styles.unpriced}>?</span></Show>
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}

export function Arbitrage() {
  const [showUnpriced, setShowUnpriced] = createSignal(false)
  const [servicesOpen, setServicesOpen] = createSignal(false)

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

  const ownedKeys = createMemo(() => Object.keys(myServices).filter(k => myServices[k]))

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
        // Free broadcast networks cost $0 to add, not "unknown" -- and
        // 0 correctly sorts ahead of every priced option below.
        costPerGame: svc.free ? 0 : (svc.price != null ? svc.price / unlocks : null),
      })
    }
    return out.sort((a, b) => {
      if (a.costPerGame == null) return 1
      if (b.costPerGame == null) return -1
      return a.costPerGame - b.costPerGame
    })
  })

  // Free broadcast nets ARE priced -- we know the price, it's $0 --
  // so they're excluded from the "unpriced" bucket, which is
  // specifically the "we genuinely don't know" case.
  const unpricedCount = createMemo(() => services().filter(s => s.price == null && !s.free).length)

  // Real, plain-language payoff -- states what the reader's current
  // real spend already covers tonight, and what the cheapest real
  // next step would unlock, instead of leaving coverage counts and a
  // cost-per-game table for the reader to connect unaided.
  const verdict = createMemo(() => {
    const c = coverage()
    if (!c.total) return null
    const spendPhrase = monthlySpend() > 0 ? `pay $${monthlySpend().toFixed(2)}/mo` : 'pay for nothing'
    const top = marginal()[0]
    if (!top) {
      return `You currently ${spendPhrase} and already cover all ${c.total} of tonight's real games -- nothing left to unlock.`
    }
    const priceText = top.free ? 'free' : top.costPerGame != null ? `$${top.costPerGame.toFixed(2)}/game` : 'unknown price'
    return `You currently ${spendPhrase}, covering ${c.covered}/${c.total} of tonight's real games. Cheapest real next step: ${top.label}, unlocking ${top.unlocks} more for ${priceText}.`
  })

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
          <button class={styles.editServicesBtn} onClick={() => setServicesOpen(true)}>
            My Services ({ownedKeys().length})
          </button>
        </div>

        <Show when={servicesOpen()}>
          <MyServicesModal services={services()} onClose={() => setServicesOpen(false)} />
        </Show>

        <Show when={verdict()}>
          <p class={styles.verdict}>{verdict()}</p>
        </Show>

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
                  {m.free ? 'free' : m.price != null ? `$${m.price.toFixed(2)}` : '—'}
                </span>
                <span class={styles.mCpg}>
                  {m.free ? 'free/game' : m.costPerGame != null ? `$${m.costPerGame.toFixed(2)}/game` : 'price unknown'}
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
              production's PRICES table — team-owned RSN feeds (Royals.TV,
              Tigers.TV) that are typically bundled rather than sold
              standalone, plus national cable networks (ESPN, TBS, FS1, NBA
              TV, MLB Network, ...) that are real, mapped services but are
              also only ever sold bundled into a cable or live-TV package,
              never standalone. Broadcast networks (FOX, CBS, NBC, ABC) are
              NOT in this list — those are shown as free, not unpriced,
              since that's a real known fact rather than a gap.
            </p>
            <div class={styles.chips}>
              <For each={services().filter(s => s.price == null && !s.free)}>
                {s => <span class={styles.chipInert}>{s.label}</span>}
              </For>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
