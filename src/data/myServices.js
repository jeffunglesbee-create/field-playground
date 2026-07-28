import { createStore } from 'solid-js/store'

// "My Services" is a real production concept (jubilant-bassoon's
// onboarding modal, gated behind `field_setup_done` in localStorage --
// confirmed via FIELD_Handoff against STANDARDS.md) for which streaming
// services a user already owns. Arbitrage's first version reinvented a
// smaller piece of this as a local, ephemeral `createStore({})` --
// this is that same concept done properly: shared across every surface
// that cares what you own, and persisted, not reset on remount.
//
// Same loadOverrides-then-persist shape as LocalNoteLayer's
// localStorage store -- proven pattern in this repo, not reinvented.

const STORAGE_KEY = 'field-my-services'

function loadOwned() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// key -> true, keyed by Arbitrage's PRICES keys (peacock, mlbtv, ...).
export const [myServices, setMyServices] = createStore(loadOwned())

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...myServices })) } catch { /* best effort */ }
}

export function toggleMyService(key) {
  setMyServices(key, v => !v)
  persist()
}
