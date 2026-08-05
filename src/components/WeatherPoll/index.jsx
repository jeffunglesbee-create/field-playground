import { For, Show, onMount, onCleanup, createMemo } from 'solid-js'
import { weatherData, refetchWeather, weatherPollCount, setWeatherPollCount } from '../../data/weather'
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
            <div class={styles.venueList}>
              <For each={weatherData().venues}>
                {v => (
                  <div class={styles.venueRow}>
                    <span class={styles.venueName}>{v.venue}</span>
                    <span class={styles.venueTemp}>{v.tempF}°F</span>
                    <span class={styles.venueCondition}>{v.condition}</span>
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
