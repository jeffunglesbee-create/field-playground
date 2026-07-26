import { createSignal, createEffect, untrack } from 'solid-js'

// Production's gamecard shows "MY TEAM" and "YOUR TEAM" together on one
// row -- two DISTINCT concurrent identities, not one converged value like
// relay.js's date sync (where every tab is expected to end up agreeing on
// the same currentDate). This merges a local signal (this tab's own pick,
// localStorage-backed, like PickEm's picks) with a REMOTE signal of the
// identical shape arriving over its own BroadcastChannel from whichever
// other tab last announced its own pick.
//
// Small two-message protocol, not just a bare value broadcast: a lone
// 'update' broadcast on every change would leave a LATE-opening tab
// blind to whatever the other tab already picked before it existed --
// BroadcastChannel has no history/replay. On init, a tab broadcasts
// 'request'; every other tab replies with its own current 'update' so
// the late joiner learns the existing pick immediately, the same
// late-joiner problem Presence's join→heartbeat-reply already solved for
// existence; this solves it for a value.

const STORAGE_KEY = 'field-playground-my-team'
const CHANNEL_NAME = 'field-playground-team-affinity'

function loadMyTeam() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

export const [myTeam, setMyTeamRaw] = createSignal(loadMyTeam())
export const [theirTeam, setTheirTeam] = createSignal(null)
export const [theirUpdatedAt, setTheirUpdatedAt] = createSignal(null)

export function setMyTeam(team) {
  setMyTeamRaw(team)
  try {
    if (team) localStorage.setItem(STORAGE_KEY, team); else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can fail (private browsing, quota) -- the pick still works
    // for the session and still broadcasts, just won't survive a reload.
  }
}

let channel = null
let started = false

export function initTeamAffinitySync() {
  if (started) return
  started = true
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    return // BroadcastChannel unavailable -- skip silently, same posture as relay.js's date sync
  }

  channel.onmessage = (event) => {
    const msg = event?.data
    if (!msg) return
    if (msg.type === 'update') {
      setTheirTeam(msg.team ?? null)
      setTheirUpdatedAt(Date.now())
      return
    }
    if (msg.type === 'request') {
      // Found via testing, not assumed: with 3+ tabs open, EVERY tab
      // replies to a 'request', and a tab with nothing set replying
      // AFTER a tab with a real pick would clobber theirTeam back to
      // null purely on arrival order -- there's no server to reconcile
      // multiple replies into one authoritative answer. Silence from a
      // tab with nothing to say, rather than a noisy null reply that can
      // arrive last and stomp a real value, is the honest fix; it does
      // NOT resolve the case where two other tabs genuinely disagree
      // (last message wins there, an inherent limit of peer-to-peer
      // broadcast with no server, not something more protocol
      // complexity here is worth solving).
      const mine = untrack(myTeam)
      if (mine) channel.postMessage({ type: 'update', team: mine })
    }
  }

  channel.postMessage({ type: 'request' })

  createEffect(() => {
    channel.postMessage({ type: 'update', team: myTeam() })
  })
}
