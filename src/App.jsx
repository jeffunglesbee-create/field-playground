import { AmbientPanel } from './components/AmbientPanel'
import { DeskCard } from './components/DeskCard'
import styles from './App.module.css'

export default function App() {
  return (
    <div class={styles.layout}>
      <section class={styles.ambient}>
        <AmbientPanel />
      </section>
      <section class={styles.desk}>
        <DeskCard />
      </section>
    </div>
  )
}
