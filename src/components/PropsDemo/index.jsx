import { mergeProps, splitProps, createSignal, For } from 'solid-js'
import styles from './PropsDemo.module.css'

// mergeProps + splitProps: canonical SolidJS prop forwarding.
//
// splitProps(props, ownKeys): splits a props object into [own, rest] where
//   own has only the listed keys, rest has everything else. Both parts stay
//   fully reactive — the original props object is NOT destructured, so
//   derived reactive values continue to track. This is why you can NOT do
//   `const { variant, ...rest } = props` in SolidJS — destructuring breaks
//   reactivity because the getter is read once.
//
// mergeProps(defaults, props): merges multiple prop objects left-to-right,
//   with later keys winning. The critical non-obvious behavior: DEFAULT VALUES
//   STAY LIVE. If defaults contains a getter (function) or if defaults itself
//   is a reactive object, the merge reflects updates. The demo below confirms
//   this: changing `defaultVariant` updates all cards that don't override it,
//   proving the merge didn't capture a stale snapshot.
//
// Rest forwarding via {...rest}: passes onClick, id, title, tabIndex, etc.
// to the underlying element. Works because rest is a reactive proxy.

const SAMPLES = [
  { label: 'pts', value: '28.4' },
  { label: 'reb', value: '9.1' },
  { label: 'ast', value: '7.3' },
  { label: 'blk', value: '1.2' },
]

function StatChip(allProps) {
  // Step 1: merge defaults — note defaultVariant is a GETTER, not a static value
  const withDefaults = mergeProps(
    { variant: allProps.defaultVariant ?? 'muted', size: 'md' },
    allProps
  )
  // Step 2: split own props from the rest to forward to the element
  const [local, rest] = splitProps(withDefaults, [
    'label', 'value', 'variant', 'size', 'defaultVariant',
  ])

  return (
    // rest contains: onClick, id, title, class, tabIndex, etc.
    <div
      class={`${styles.chip} ${styles[local.size]} ${styles[local.variant]}`}
      {...rest}
    >
      <span class={styles.chipLabel}>{local.label}</span>
      <span class={styles.chipValue}>{local.value}</span>
    </div>
  )
}

export function PropsDemo() {
  // This signal drives the DEFAULT value for all chips that don't override variant.
  // Changing it proves the default stays live through the merge.
  const [defaultVariant, setDefaultVariant] = createSignal('muted')
  const [clickedLabel, setClickedLabel] = createSignal(null)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Props</span>
        <span class={styles.sublabel}>mergeProps + splitProps</span>
      </header>
      <p class={styles.note}>
        Chips use splitProps to separate own keys from rest (forwarded to div).
        Default variant is a reactive signal — toggle it to confirm defaults stay live.
      </p>

      <div class={styles.variantRow}>
        <span class={styles.variantKey}>default variant</span>
        <For each={['muted', 'primary', 'accent']}>
          {(v) => (
            <button
              class={styles.variantBtn}
              data-active={defaultVariant() === v}
              onClick={() => setDefaultVariant(v)}
            >
              {v}
            </button>
          )}
        </For>
      </div>

      <div class={styles.chipRow}>
        <For each={SAMPLES}>
          {(s) => (
            <StatChip
              label={s.label}
              value={s.value}
              defaultVariant={defaultVariant()}
              onClick={() => setClickedLabel(s.label)}
              title={`stat: ${s.label}`}
            />
          )}
        </For>
        {/* This one overrides variant — won't respond to defaultVariant toggle */}
        <StatChip
          label="fg%"
          value="54.1"
          variant="accent"
          size="lg"
          defaultVariant={defaultVariant()}
          onClick={() => setClickedLabel('fg%')}
          title="explicit accent override"
        />
      </div>

      <div class={styles.restProof}>
        <span class={styles.restKey}>onClick last fired:</span>
        <span class={styles.restVal}>{clickedLabel() ?? '—'}</span>
        <span class={styles.restNote}>(forwarded via {'{...rest}'})</span>
      </div>
    </div>
  )
}
