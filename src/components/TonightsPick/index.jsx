import { For, Show, createMemo } from 'solid-js'
import { deskStore } from '../../data/relay'
import { gameStatus, lineMovement, dramaTier, dramaLabel } from '../DeskCard'
import { PRICES, parseStreams } from '../Arbitrage'
import { myServices } from '../../data/myServices'
import { weatherData } from '../../data/weather'
import styles from './TonightsPick.module.css'

// Tonight's Pick — the synthesis surface. Everything built in this
// playground so far has been one real signal at a time: drama_peak
// (DramaLeaderboard), line movement (DeskCard's OddsRow), cost to
// watch (Arbitrage), weather (WeatherPoll). A user who wants "what's
// actually worth my time tonight" still has to cross-reference four
// separate panels to answer that. This ties those four already-
// verified real signals into one ranked, explained list -- nothing
// here is a new data source, only a new combination of ones already
// proven real elsewhere in this repo.
//
// SCORING is deliberately simple and fully shown on each card, not a
// black box: every point on the score is visible as a badge. A game
// you can't currently watch (already finished) isn't ranked at all --
// "tonight's pick" implies you can still act on it.
//
//   + drama_peak                 0-100, the real ported field
//   + 25 if live right now       happening beats upcoming
//   + 10 if the line moved       a real market signal of a contested game
//   - 30 if live and a blowout   margin > 20, same threshold GameRow uses
//
// COST TO WATCH reuses Arbitrage's exact PRICES table and stream
// parser -- not a second copy -- and now also reads the shared
// `myServices` store, so a game reachable through something you
// already own shows "you have this" instead of a price you'd be
// paying twice for.

const LIVE_BONUS = 25
const MOVED_BONUS = 10
const BLOWOUT_PENALTY = 30
const BLOWOUT_MARGIN = 20

function cheapestStream(streamsRaw) {
  const streams = parseStreams(streamsRaw)
  if (!streams.length) return null
  // Free broadcast (FOX/CBS/NBC/ABC, from Arbitrage's SERVICE_MAP) beats
  // every other option -- it needs no subscription at all, owned or not.
  const free = streams.find(s => s.free)
  if (free) return { label: free.label, owned: false, free: true, price: 0 }
  const owned = streams.find(s => s.key && myServices[s.key])
  if (owned) return { label: owned.label, owned: true, free: false, price: 0 }
  const priced = streams.filter(s => s.price != null).sort((a, b) => a.price - b.price)
  if (priced.length) return { label: priced[0].label, owned: false, free: false, price: priced[0].price }
  return { label: streams[0].label, owned: false, free: false, price: null }
}

// weatherData is a createResource -- calling its accessor while the
// resource is in an error state re-throws that error (the exact bug
// class App.jsx's own header comment documents from WeatherPoll's
// first version). Same guard WeatherPoll uses itself: check .error
// before ever calling weatherData().
function weatherFor(venue) {
  if (!venue || weatherData.error) return null
  const venues = weatherData()?.venues
  return venues?.find(v => v.venue === venue) ?? null
}

function scoreGame(g) {
  const status = gameStatus(g)
  const dramaPeak = g.drama_peak ?? 0
  const movement = lineMovement(g.opening_odds, g.closing_odds)
  const moved = movement?.status === 'moved'
  const margin = Math.abs((g.home_score ?? 0) - (g.away_score ?? 0))
  const isBlowout = status === 'live' && margin > BLOWOUT_MARGIN

  let score = dramaPeak
  if (status === 'live') score += LIVE_BONUS
  if (moved) score += MOVED_BONUS
  if (isBlowout) score -= BLOWOUT_PENALTY

  return {
    game: g,
    status,
    dramaPeak,
    tier: dramaTier(dramaPeak),
    label: dramaLabel(dramaPeak),
    movement,
    moved,
    isBlowout,
    stream: cheapestStream(g.streams),
    weather: weatherFor(g.venue),
    score,
  }
}

export function TonightsPick() {
  const ranked = createMemo(() => {
    const games = [
      ...(deskStore.games?.regular ?? []),
      ...(deskStore.games?.postseason ?? []),
    ]
    return games
      .filter(g => gameStatus(g) !== 'final' && gameStatus(g) !== 'final_ot')
      .map(scoreGame)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  })

  // Real, plain-language payoff -- names the single best real use of
  // the reader's night before the ranked cards, instead of leaving
  // four separate badges for the reader to weigh unaided.
  const verdict = createMemo(() => {
    const top = ranked()[0]
    if (!top) return null
    const statusText = top.status === 'live' ? 'live right now' : top.status === 'pre' ? 'coming up' : top.status
    const dramaText = top.tier ? `${top.label} ${top.tier}` : 'undramatic so far'
    const streamText = !top.stream
      ? 'no stream data'
      : top.stream.free
        ? `free on ${top.stream.label}`
        : top.stream.owned
          ? `already covered by ${top.stream.label}`
          : top.stream.price != null
            ? `$${top.stream.price.toFixed(2)}/mo on ${top.stream.label}`
            : `on ${top.stream.label}, price unknown`
    return `Tonight's best real use of your time: ${top.game.away} @ ${top.game.home} -- ${statusText}, ${dramaText}, ${streamText}.`
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Tonight's Pick</span>
        <span class={styles.note}>drama + line movement + cost to watch + weather, combined</span>
      </header>

      <Show when={ranked().length} fallback={<p class={styles.empty}>Nothing left to watch today.</p>}>
        <p class={styles.verdict}>{verdict()}</p>
        <div class={styles.list}>
          <For each={ranked()}>
            {(entry, i) => (
              <div class={styles.card}>
                <span class={styles.rank}>{i() + 1}</span>
                <div class={styles.body}>
                  <div class={styles.rowHead}>
                    <span class={styles.matchup}>{entry.game.away} @ {entry.game.home}</span>
                    <span class={`${styles.statusBadge} ${styles['status_' + entry.status]}`}>
                      {entry.status === 'live' ? 'LIVE' : entry.status === 'pre' ? 'upcoming' : entry.status}
                    </span>
                  </div>
                  <div class={styles.badges}>
                    <Show when={entry.tier}>
                      <span class={styles.badge} title={`drama peak ${entry.dramaPeak}`}>
                        {entry.label} {entry.tier}
                      </span>
                    </Show>
                    <Show when={entry.moved}>
                      <span class={`${styles.badge} ${styles.badgeMoved}`}>line moved</span>
                    </Show>
                    <Show when={entry.isBlowout}>
                      <span class={`${styles.badge} ${styles.badgeBlowout}`}>blowout</span>
                    </Show>
                    <Show when={entry.stream} fallback={<span class={styles.badgeMuted}>no stream data</span>}>
                      <span class={`${styles.badge} ${entry.stream.owned || entry.stream.free ? styles.badgeOwned : ''}`}>
                        {entry.stream.free
                          ? `free — ${entry.stream.label}`
                          : entry.stream.owned
                            ? `you have it — ${entry.stream.label}`
                            : entry.stream.price != null
                              ? `${entry.stream.label} $${entry.stream.price.toFixed(2)}/mo`
                              : `${entry.stream.label} — price unknown`}
                      </span>
                    </Show>
                    <Show when={entry.weather}>
                      <span class={styles.badgeMuted}>
                        {entry.weather.tempF}°F {entry.weather.condition}
                        <Show when={entry.weather.roofType !== 'open'}>
                          {' '}({entry.weather.roofType === 'dome' ? 'dome' : 'retractable'})
                        </Show>
                      </span>
                    </Show>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
