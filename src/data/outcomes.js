import { createSignal } from 'solid-js'

const KEY = 'field-pick-outcomes'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  catch { return {} }
}

const [outcomes, setOutcomesSignal] = createSignal(load())

export function setOutcome(gameId, result) {
  const next = { ...outcomes(), [gameId]: result }
  setOutcomesSignal(next)
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function clearOutcome(gameId) {
  const next = { ...outcomes() }
  delete next[gameId]
  setOutcomesSignal(next)
  localStorage.setItem(KEY, JSON.stringify(next))
}

export { outcomes }
