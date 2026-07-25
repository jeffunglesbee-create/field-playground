import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Standalone single-file artifact build target.
//
// The ONLY difference from the main config is the alias below: every
// import of `./lazyModules` resolves to `lazyModules.artifact.js`
// instead, which uses `lazy(() => Promise.resolve(...))` rather than
// `lazy(() => import(...))`. Result: zero emitted chunks, so the whole
// app fits in one inlined file with nothing left to fetch.
//
// This replaces an earlier approach that duplicated the entire App into
// `App.artifact.jsx`. That duplicate drifted from `App.jsx` twice in a
// single day -- first missing an ErrorBoundary fix, then missing five
// whole components -- and shipped a broken artifact both times. Aliasing
// one small module means there is only ever one App.jsx, which cannot
// drift from itself.
//
// `App.artifact.jsx`, `main.artifact.jsx`, and `index.artifact.html` are
// now dead and safe to delete (chat has no delete capability).
//
// mockRelay is deliberately omitted: it only runs via configureServer, a
// dev-server hook that's inert during `vite build` anyway. Production
// builds hit the real relay per relay.js's own DEV check.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: [
      {
        find: /^(.*\/)?lazyModules$/,
        replacement: path.resolve(dirname, 'src/lazyModules.artifact.js'),
      },
    ],
  },
  build: {
    outDir: 'dist-artifact',
  },
})
