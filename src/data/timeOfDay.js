import { createSignal, onCleanup } from 'solid-js'

// Shared time-of-day signal. A single interval, module-level, rather
// than each consumer running its own -- multiple components reading
// the same wall-clock mode shouldn't mean multiple timers doing
// identical work.
const [hour, setHour] = createSignal(new Date().getHours())

let subscriberCount = 0
let intervalHandle = null

export function useTimeOfDay() {
  subscriberCount++
  if (subscriberCount === 1) {
    intervalHandle = setInterval(() => setHour(new Date().getHours()), 60000)
  }
  onCleanup(() => {
    subscriberCount--
    if (subscriberCount === 0 && intervalHandle) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }
  })
  return () => {
    const h = hour()
    if (h < 7) return 'morning'
    if (h < 16) return 'midday'
    if (h < 22) return 'evening'
    return 'late'
  }
}
