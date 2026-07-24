import { Show } from 'solid-js'
import { deskData } from '../../data/relay'
import styles from './DeskCard.module.css'

function DeskSkeleton() {
  return (
    <div class={styles.skeleton}>
      <div class={`${styles.skeletonBar} ${styles.wide}`} />
      <div class={`${styles.skeletonBar} ${styles.medium}`} />
      <div class={`${styles.skeletonBar} ${styles.narrow}`} />
    </div>
  )
}

function DeskContent(props) {
  return (
    <div class={styles.card}>
      <pre class={styles.debug}>{JSON.stringify(props.data, null, 2)}</pre>
    </div>
  )
}

export function DeskCard() {
  return (
    <div class={styles.root}>
      <h2 class={styles.label}>Desk</h2>
      <Show when={!deskData.loading} fallback={<DeskSkeleton />}>
        <Show when={!deskData.error} fallback={
          <p class={styles.error}>{String(deskData.error)}</p>
        }>
          <DeskContent data={deskData()} />
        </Show>
      </Show>
    </div>
  )
}
