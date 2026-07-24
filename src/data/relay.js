import { createSignal, createResource } from 'solid-js'

const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// Reactive date signal — swap to navigate days without a page reload.
export const [currentDate, setCurrentDate] = createSignal(todayStr())

async function fetchAmbient(date) {
  const res = await fetch(`${RELAY_BASE}/analytics/newspaper/${date}`)
  if (!res.ok) throw new Error(`newspaper fetch failed: ${res.status}`)
  return res.json()
}

async function fetchDesk(date) {
  const res = await fetch(`${RELAY_BASE}/context/date/${date}`)
  if (!res.ok) throw new Error(`context fetch failed: ${res.status}`)
  return res.json()
}

export const [ambientData, { refetch: refetchAmbient }] = createResource(currentDate, fetchAmbient)
export const [deskData,    { refetch: refetchDesk }]    = createResource(currentDate, fetchDesk)
