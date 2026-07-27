import { onMount, onCleanup, createEffect } from 'solid-js'
import { renderAll } from './vanillaRenderer'
import styles from './ControlGroup.module.css'

// Thin SolidJS wrapper whose only job is to hand off to vanillaRenderer's
// imperative code on every real data change -- it does NOT render
// anything declaratively itself. createEffect here provides only the
// "when," reading props.games() so it re-runs whenever deskStore's
// reconciled reference changes (the same real 15s poll cycle driving the
// ReconcileGameList sibling); everything after that line is manual DOM
// work, exactly like production's field.js.
export function VanillaGameList(props) {
  let container
  const nodesById = new Map()

  onMount(() => {
    createEffect(() => {
      const games = props.games()
      renderAll(container, games, nodesById)
    })
  })

  onCleanup(() => {
    nodesById.clear()
  })

  // Function ref: assigns the local `container` binding renderAll needs,
  // AND forwards the same node to the parent's own ref (for its
  // MutationObserver) -- both consumers need the identical DOM node.
  return (
    <div
      class={styles.list}
      ref={(el) => {
        container = el
        props.ref?.(el)
      }}
    />
  )
}
