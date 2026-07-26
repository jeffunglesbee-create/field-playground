import { For, Show, onMount, onCleanup } from 'solid-js'
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
        than sharing it — real venues from today's slate, temps drift slightly each request so the
        independent cadence is provable, not just asserted.
      </p>
      <div class={styles.pollCount}>independently polled {weatherPollCount()} time{weatherPollCount() === 1 ? '' : 's'}</div>
      <Show
        when={weatherData()}
        fallback={<p class={styles.empty}>{weatherData.error ? 'Unable to load weather.' : 'Loading…'}</p>}
      >
        <div class={styles.venueList}>
          <For each={weatherData().venues}>
            {v => (
              <div class={styles.venueRow}>
                <span class={styles.venueName}>{v.venue}</span>
                <span class={styles.venueTemp}>{v.tempF}°F</span>
                <span class={styles.venueCondition}>{v.condition}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
