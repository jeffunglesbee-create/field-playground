import { For } from 'solid-js'
import styles from './Ground.module.css'

// PURE UI MOCKUP — see docs/EXPERIMENT-seasons-ground-mockups.md. Unlike
// every other component here, this has no data source at all, real or
// sample-standing-in-for-real. No FIELD data informs this; a real version
// needs moderation infrastructure this repo has no way to represent.
// This tests "does the concept look right," not an architecture claim —
// worth being honest that it's a different kind of "done."

const SAMPLE_POSTS = [
  { id: 1, team: 'Brewers', author: 'mkefan88', time: '4m', text: "that 8th inning was exactly why I still buy tickets. building's louder than I've heard it all year", reactions: 12 },
  { id: 2, team: 'Sounders', author: 'rainshadow', time: '11m', text: 'rivalry week nerves are real. anyone else watching from the away section tonight?', reactions: 4 },
  { id: 3, team: 'Aces', author: 'vegasorbust', time: '22m', text: "seeding picture just got a lot clearer after that road win. we're in good shape heading into the final week", reactions: 27 },
  { id: 4, team: 'Brewers', author: 'cream_city', time: '38m', text: 'division lead feels safer than it should this time of year but I\'ll take it', reactions: 8 },
]

export function Ground() {
  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Ground</span>
        <span class={styles.sampleTag}>MOCKUP — sample content, no backend</span>
      </header>
      <p class={styles.note}>
        Fan reactions tied to games/teams. Pure concept test — nothing
        below is real, nothing persists, no moderation exists. Different
        kind of question than everything else here: does this feel worth
        building, not does it work correctly.
      </p>
      <div class={styles.postList}>
        <For each={SAMPLE_POSTS}>
          {post => (
            <div class={styles.post}>
              <div class={styles.postHead}>
                <span class={styles.teamTag}>{post.team}</span>
                <span class={styles.author}>{post.author}</span>
                <span class={styles.time}>{post.time}</span>
              </div>
              <p class={styles.postText}>{post.text}</p>
              <div class={styles.reactions}>♡ {post.reactions}</div>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
