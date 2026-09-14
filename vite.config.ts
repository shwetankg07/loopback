import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  // Only imported from a worker, so the dev server would otherwise discover it mid-run and reload the page.
  optimizeDeps: { include: ['@runno/wasi'] },
  build: { target: 'esnext' },
})
