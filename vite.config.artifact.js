import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// Separate build target for the standalone single-file artifact.
// No mockRelay -- that plugin only runs via configureServer, a dev-server
// hook that's inert during `vite build` regardless; production builds
// already hit the real relay per relay.js's own DEV-check pattern
// (RELAY_BASE = import.meta.env.DEV ? '' : 'https://field-relay-nba...').
//
// The only real difference from the main config: entry point is
// index.artifact.html -> main.artifact.jsx -> App.artifact.jsx, which
// uses lazy(() => Promise.resolve(...)) instead of lazy(() => import(...))
// for Seasons and HeavyPanel, so this build produces zero extra chunks --
// genuinely self-contained output, not a chunked build post-processed
// after the fact.
export default defineConfig({
  plugins: [solid()],
  build: {
    outDir: 'dist-artifact',
    rollupOptions: {
      input: 'index.artifact.html',
    },
  },
})
