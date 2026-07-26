import { createResource, createSignal } from 'solid-js'
import { currentDate } from './relay'

const RELAY_BASE = import.meta.env.DEV
  ? ''
  : 'https://field-relay-nba.jeffunglesbee.workers.dev'

// Every other resource in this repo shares App.jsx's single 15s
// setInterval (deskData) or fetches once (ambientData, journalismBrief's
// own separate cadence). This is the first resource with its OWN
// independent poll loop at a DIFFERENT, deliberately slower cadence than
// the shared one -- production's weather chip has no reason to refresh
// as often as scores do. The question under test: do two independently-
// paced createResource poll loops coexist cleanly, or does one starve,
// race, or otherwise interfere with the other? WeatherPoll owns the
// actual setInterval (same pattern App.jsx already uses for deskData);
// this module only owns the resource + fetcher.

async function fetchWeather(date) {
  const res = await fetch(`${RELAY_BASE}/weather/today/${date}`)
  if (!res.ok) throw new Error(`weather fetch failed: ${res.status}`)
  return res.json()
}

export const [weatherData, { refetch: refetchWeather }] = createResource(currentDate, fetchWeather)

export const [weatherPollCount, setWeatherPollCount] = createSignal(0)
