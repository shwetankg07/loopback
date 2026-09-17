import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  // Only imported from workers, so the dev server would otherwise discover them mid-run and reload the page.
  optimizeDeps: { include: ['@runno/wasi', 'sucrase'] },
  build: { target: 'esnext' },
})
