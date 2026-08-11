import { For, Show, onMount, onCleanup, createMemo } from 'solid-js'
import { weatherData, refetchWeather, weatherPollCount, setWeatherPollCount } from '../../data/weather'
import { weatherDramaContribution, AQI_GATE } from '../../data/weatherDrama'
import styles from './WeatherPoll.module.css'

// Deliberately different cadence from App.jsx's shared 15s deskData poll
// -- production's weather chip has no reason to refresh as often as
// scores do. This component owns the actual setInterval, same pattern
// App.jsx already uses for deskData, just at its own pace, to prove two
// independently-timed poll loops can coexist without one starving or
// interfering with the other.
const WEATHER_POLL_MS = 45000

export function WeatherPoll() {
  // Real, plain-language payoff -- names tonight's actual warmest and
  // coldest real outdoor venues instead of leaving a list of temps for
  // the reader to scan and compare unaided. Domed/retractable venues are
  // excluded: their real weather is at the venue's location, not
  // necessarily what the game itself experiences (see roofNote below).
  const verdict = createMemo(() => {
    // Guarded read. A createMemo re-runs when its resource errors, and reading
    // an errored createResource accessor RE-THROWS -- from inside a memo that
    // throw escapes to the section ErrorBoundary, which is why this component's
    // own "Unable to load weather" state was unreachable on a total failure and
    // the card showed a bare boundary "Retry" instead. Same bug class as
    // src/data/safeResource.js and App.jsx's note at line ~142: check .error
    // BEFORE ever calling the accessor.
    if (weatherData.error) return null
    const venues = weatherData()?.venues ?? []
    const outdoor = venues.filter(v => v.roofType === 'open')
    if (!outdoor.length) return null
    const warmest = outdoor.reduce((a, b) => (b.tempF > a.tempF ? b : a))
    const coldest = outdoor.reduce((a, b) => (b.tempF < a.tempF ? b : a))
    // A single real outdoor venue and a real tie between two-or-more
    // distinct venues both land warmest.venue === coldest.venue (reduce
    // keeps the first element on a tie), so that equality alone can't
    // distinguish "only one venue" from "several venues, same temp" --
    // outdoor.length is the actual signal for which case this is.
    if (outdoor.length === 1) {
      return `Tonight's only real outdoor venue: ${warmest.venue} at ${warmest.tempF}°F, ${warmest.condition}.`
    }
    if (warmest.tempF === coldest.tempF) {
      return `Tonight's ${outdoor.length} real outdoor venues are all tied at ${warmest.tempF}°F (${warmest.condition}).`
    }
    return `Tonight's warmest real outdoor venue: ${warmest.venue} at ${warmest.tempF}°F (${warmest.condition}) -- coldest is ${coldest.venue} at ${coldest.tempF}°F (${coldest.condition}).`
  })

  // Production adds this delta to `sitBonus` inside dramaScoreLive(), which is
  // why a drama_arc is partly a weather series. Surfaced here because that
  // coupling is otherwise invisible: nothing on a desk card says a cold windy
  // night moved the number without anything happening on the field.
  //
  // SCOPED CLAIM, and the scope is the point. This is what CURRENT conditions
  // WOULD contribute to a live drama score computed right now. It is NOT a
  // decomposition of any archived drama_peak -- that peak was computed from the
  // weather during that game, which is not the weather now. Nothing here is
  // joined to drama_peak, and the copy says "would add", never "of".
  const dramaEffects = createMemo(() => {
    if (weatherData.error) return []
    return (weatherData()?.venues ?? [])
      .map(v => ({ venue: v.venue, ...weatherDramaContribution(v) }))
      .filter(e => e.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  })

  // Venues whose band total is non-zero but whose gate never opened. This list
  // is the whole reason the gate was ported: every one of these was previously
  // rendered as a live "+N drama" chip, which claimed a contribution
  // production would never have made.
  const gatedOut = createMemo(() => dramaEffects().filter(e => !e.gate.open))

  const dramaVerdict = createMemo(() => {
    if (weatherData.error) return null
    const venues = weatherData()?.venues ?? []
    if (!venues.length) return null
    const effects = dramaEffects()
    if (!effects.length) {
      return `Conditions are unremarkable everywhere — no venue's weather would move a live drama score right now.`
    }
    const applied = effects.filter(e => e.gate.open)
    if (!applied.length) {
      const top = effects[0]
      return `No venue clears production's gate right now. ${top.venue} scores ${top.delta > 0 ? '+' : ''}${top.delta} on the band table (${top.reasons.join(', ')}), but nothing there trips wxAlert and its AQI is at or below ${AQI_GATE}, so production would add nothing at all.`
    }
    const top = applied[0]
    return `${top.venue} has the largest weather effect: current conditions would ${top.delta > 0 ? 'add' : 'subtract'} ${Math.abs(top.delta)} to a live drama score (${top.reasons.join(', ')}), and it clears the gate via ${top.gate.why}.`
  })

  onMount(() => {
    const handle = setInterval(() => {
      refetchWeather()
      setWeatherPollCount(c => c + 1)
    }, WEATHER_POLL_MS)
    onCleanup(() => clearInterval(handle))
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Weather Poll</span>
        <span class={styles.sublabel}>independent {WEATHER_POLL_MS / 1000}s cadence, desk polls every 15s</span>
      </header>
      <p class={styles.note}>
        Its own resource, its own setInterval, running alongside deskData's shared 15s poll rather
        than sharing it — real venues from the selected date's outdoor slate, fetched live from
        Open-Meteo (no key, CORS-open, free-tier rate limited) so the independent cadence is
        provable against real, changing weather, not a fabricated jitter.
      </p>
      <a class={styles.attribution} href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
        Weather data by Open-Meteo.com (CC BY 4.0)
      </a>
      <div class={styles.pollCount}>independently polled {weatherPollCount()} time{weatherPollCount() === 1 ? '' : 's'}</div>
      <Show when={weatherData.error}>
        <p class={styles.empty}>Unable to load weather{weatherData.error?.message ? `: ${weatherData.error.message}` : ''}.</p>
      </Show>
      <Show when={!weatherData.error}>
        <Show when={weatherData()} fallback={<p class={styles.empty}>Loading…</p>}>
          <Show
            when={weatherData().venues.length > 0}
            fallback={<p class={styles.empty}>No venues with known coordinates in the selected date's slate.</p>}
          >
            <Show when={verdict()}>
              <p class={styles.verdict}>{verdict()}</p>
            </Show>
            <Show when={dramaVerdict()}>
              <p class={styles.verdict}>{dramaVerdict()}</p>
            </Show>
            <Show when={dramaEffects().length}>
              <div class={styles.dramaNote}>
                Production feeds this delta into <code>sitBonus</code> inside <code>dramaScoreLive()</code>,
                so weather is part of the drama score itself. Current conditions only — it does not
                decompose an archived peak. It is also <em>gated</em>: the modifier only runs when a
                venue trips <code>wxAlert()</code> or carries AQI over {AQI_GATE}. A band total shown
                with a struck-through chip is one production would compute and never apply.
              </div>
            </Show>
            <Show when={gatedOut().length}>
              <p class={styles.verdict}>
                {gatedOut().length === 1
                  ? '1 venue scores on the band table but never reaches'
                  : `${gatedOut().length} venues score on the band table but never reach`}
                {' '}a drama score: the gate's thresholds sit above the first scoring band on the
                same field (gusts open it at 30mph but already score at 20mph; rain opens it at
                5mm but already scores at 2mm), so this gap is structural rather than a rounding
                edge.
              </p>
            </Show>
            <div class={styles.venueList}>
              <For each={weatherData().venues}>
                {v => (
                  <div class={styles.venueRow}>
                    <span class={styles.venueName}>{v.venue}</span>
                    <span class={styles.venueTemp}>{v.tempF}°F</span>
                    <span class={styles.venueCondition}>{v.condition}</span>
                    <Show when={weatherDramaContribution(v).delta !== 0}>
                      {(() => {
                        const c = weatherDramaContribution(v)
                        return (
                          <span
                            class={`${styles.dramaDelta} ${c.delta > 0 ? styles.dramaUp : styles.dramaDown} ${c.gate.open ? '' : styles.dramaGated}`}
                            title={c.gate.open
                              ? `${c.reasons.join(', ')} — gate open via ${c.gate.why}`
                              : `${c.reasons.join(', ')} — gate SHUT, so production applies 0`}
                          >
                            {c.delta > 0 ? '+' : ''}{c.delta} drama
                          </span>
                        )
                      })()}
                    </Show>
                    <Show when={v.roofType !== 'open'}>
                      <span class={styles.roofNote} title="Weather is at the venue's real location -- the roof may still be closed for the game itself">
                        {v.roofType === 'dome' ? 'dome' : 'retractable roof'}
                      </span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
