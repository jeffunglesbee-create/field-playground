import { Show, For } from 'solid-js'
import { ambientData } from '../../data/relay'
import styles from './AmbientPanel.module.css'

function AmbientSkeleton() {
  return (
    <div class={styles.skeleton}>
      <div class={`${styles.skeletonBar} ${styles.wide}`} />
      <div class={`${styles.skeletonBar} ${styles.medium}`} />
      <div class={`${styles.skeletonBar} ${styles.narrow}`} />
    </div>
  )
}

function AmbientContent(props) {
  return (
    <div class={styles.panel}>
      <pre class={styles.debug}>{JSON.stringify(props.data, null, 2)}</pre>
    </div>
  )
}

export function AmbientPanel() {
  return (
    <div class={styles.root}>
      <h2 class={styles.label}>Ambient</h2>
      <Show when={!ambientData.loading} fallback={<AmbientSkeleton />}>
        <Show when={!ambientData.error} fallback={
          <p class={styles.error}>{String(ambientData.error)}</p>
        }>
          <AmbientContent data={ambientData()} />
        </Show>
      </Show>
    </div>
  )
}
