import { createResource } from 'solid-js'

// TODO: fill in base URL once relay endpoints are confirmed via probe_relay_route
const RELAY_BASE = ''

async function fetchAmbient() {
  const res = await fetch(`${RELAY_BASE}/ambient`)
  if (!res.ok) throw new Error(`ambient fetch failed: ${res.status}`)
  return res.json()
}

async function fetchDesk() {
  const res = await fetch(`${RELAY_BASE}/desk`)
  if (!res.ok) throw new Error(`desk fetch failed: ${res.status}`)
  return res.json()
}

export const [ambientData, { refetch: refetchAmbient }] = createResource(fetchAmbient)
export const [deskData,    { refetch: refetchDesk }]    = createResource(fetchDesk)
