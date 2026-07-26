import { createSignal } from 'solid-js'

// Generic undo/redo middleware over createSignal. The research question:
// can setter calls be intercepted cleanly enough to build undo without
// coupling it to individual stores? Answer: yes -- wrap the setter
// factory itself rather than patching Solid's internals. Every write
// funnels through this one function, so recording is just "push the
// PREVIOUS value before applying the next one."
//
// undo()/redo() replay through the same underlying setInternal, but with
// a `suppress` flag so applying a recorded value doesn't itself get
// recorded as a fresh entry -- without that flag, undo() would push the
// value it just moved away from back onto undoStack, and the stacks
// would never actually shrink (every undo would look like a new edit to
// the recorder).
//
// Deliberately NOT hooked into createSignal globally (no monkey-patching
// Solid internals, no interception of signals that didn't opt in) --
// this is a drop-in replacement for createSignal at call sites that want
// undo, nothing more. Genuinely orthogonal to createStore's own
// mutation tracking; a store's fine-grained per-path writes are a
// different shape of "write" than this coarse whole-value undo targets.
export function createUndoableSignal(initial, options = {}) {
  const maxDepth = options.maxDepth ?? 100
  const [value, setInternal] = createSignal(initial)
  const [undoDepth, setUndoDepth] = createSignal(0)
  const [redoDepth, setRedoDepth] = createSignal(0)
  const undoStack = []
  const redoStack = []
  let suppress = false

  function setValue(next) {
    const resolved = typeof next === 'function' ? next(value()) : next
    if (!suppress) {
      undoStack.push(value())
      if (undoStack.length > maxDepth) undoStack.shift()
      redoStack.length = 0
      setUndoDepth(undoStack.length)
      setRedoDepth(0)
    }
    setInternal(() => resolved)
    return resolved
  }

  function undo() {
    if (!undoStack.length) return false
    const prev = undoStack.pop()
    redoStack.push(value())
    suppress = true
    setInternal(() => prev)
    suppress = false
    setUndoDepth(undoStack.length)
    setRedoDepth(redoStack.length)
    return true
  }

  function redo() {
    if (!redoStack.length) return false
    const next = redoStack.pop()
    undoStack.push(value())
    suppress = true
    setInternal(() => next)
    suppress = false
    setUndoDepth(undoStack.length)
    setRedoDepth(redoStack.length)
    return true
  }

  return [value, setValue, { undo, redo, canUndo: () => undoDepth() > 0, canRedo: () => redoDepth() > 0, undoDepth, redoDepth }]
}
