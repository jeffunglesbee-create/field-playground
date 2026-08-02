// One canonical fix for a bug class this codebase has independently
// rediscovered and re-fixed at least four times: reading a Solid
// `createResource` accessor while its resource is in an error state
// re-throws instead of returning safely -- crashing whichever memo,
// createResource source, or JSX read touches it first, often before a
// component's own `.error` branch further down ever gets a chance to
// render. Confirmed independently in DayComparison/MultiDayStreak/
// JournalismBrief (earlier this session), BsdXgPanel/WcBracketTree/
// Newspaper (later), and GameSymphonyArchive (found by a real
// artifact-check.yml crash, "Failed to fetch," after this session's own
// local Playwright testing -- which used mocked data -- never exercised
// the real error path at all).
//
// Each fix so far has been a correct, hand-written one-off. This gives
// future components a single, discoverable thing to reach for instead
// of re-deriving the same guard a fifth time.
//
// Usage:
//   const safe = safeResource(someResource)          // safe(): T | undefined
//   const safe = safeResource(someResource, [])       // safe(): T | []
//   createResource(safeResource(otherResource, null), fetcher)
export function safeResource(resource, fallback = undefined) {
  return () => (resource.error ? fallback : resource())
}
