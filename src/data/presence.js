import { createSignal, createEffect } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { currentDate } from './relay'

// Presence has no server -- BroadcastChannel is the entire transport, and
// the protocol has to invent its own join/leave/keepalive semantics from
// scratch: there's no connection event, no server-side disconnect
// detection, nothing but postMessage between same-origin tabs. A tab
// that crashes or is force-closed never gets to send 'leave' -- staleness
// (missed heartbeats) is the ONLY way anyone else finds out it's gone.
// This is a genuinely different channel than relay.js's date-sync
// BroadcastChannel (separate channel name) -- date-sync tests whether a
// signal write from outside the component tree still propagates
// cleanly; this tests whether a real multi-party protocol (not just a
// one-shot echo) can be built on top of the same zero-server primitive.

const CHANNEL_NAME = 'field-playground-presence'
const HEARTBEAT_MS = 5000
const STALE_AFTER_MS = HEARTBEAT_MS * 2.5
const MAX_EVENTS = 40

function randomTabId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 8)
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export const myTabId = randomTabId()

// peers[tabId] = { date, lastSeen } -- every OTHER known tab. Self is not
// stored here; components add +1 for self where the count matters.
export const [peers, setPeers] = createStore({})
export const [presenceEvents, setPresenceEvents] = createSignal([])

function logEvent(kind, id, date) {
  setPresenceEvents(e => [...e.slice(-(MAX_EVENTS - 1)), { kind, id, date, at: Date.now() }])
}

let channel = null
let started = false

export function initPresence() {
  if (started) return
  started = true
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    return // BroadcastChannel unavailable -- skip silently, same fallback posture as relay.js's date sync
  }

  channel.onmessage = (event) => {
    const msg = event?.data
    if (!msg || msg.id === myTabId) return

    if (msg.type === 'leave') {
      setPeers(produce(p => { delete p[msg.id] }))
      logEvent('leave', msg.id, msg.date)
      return
    }

    if (msg.type === 'join' || msg.type === 'heartbeat') {
      const isNew = !peers[msg.id]
      setPeers(msg.id, { date: msg.date, lastSeen: Date.now() })
      logEvent(isNew ? 'join' : 'heartbeat', msg.id, msg.date)
      // A brand-new peer just announced itself -- reply immediately so it
      // doesn't have to wait up to HEARTBEAT_MS to discover THIS tab.
      // Existing tabs don't need to reply to each other's routine
      // heartbeats, only to a genuine join.
      if (msg.type === 'join') {
        channel.postMessage({ type: 'heartbeat', id: myTabId, date: currentDate() })
      }
    }
  }

  channel.postMessage({ type: 'join', id: myTabId, date: currentDate() })
  logEvent('join', myTabId, currentDate())

  setInterval(() => {
    channel.postMessage({ type: 'heartbeat', id: myTabId, date: currentDate() })
  }, HEARTBEAT_MS)

  setInterval(() => {
    const cutoff = Date.now() - STALE_AFTER_MS
    setPeers(produce(p => {
      for (const id of Object.keys(p)) {
        if (p[id].lastSeen < cutoff) {
          const staleDate = p[id].date
          delete p[id]
          logEvent('timeout', id, staleDate)
        }
      }
    }))
  }, HEARTBEAT_MS)

  function sendLeave() {
    channel.postMessage({ type: 'leave', id: myTabId, date: currentDate() })
  }
  window.addEventListener('beforeunload', sendLeave)

  // A date change on THIS tab is announced immediately rather than
  // waiting for the next heartbeat tick -- other tabs' viewer counts
  // should follow a date navigation promptly, not lag by up to 5s.
  createEffect(() => {
    const date = currentDate()
    channel?.postMessage({ type: 'heartbeat', id: myTabId, date })
  })

  // No onCleanup here -- this is fire-and-forget module wiring for the
  // life of the tab, same rationale as relay.js's initBroadcastDateSync,
  // called once from App's onMount and never torn down.
}
