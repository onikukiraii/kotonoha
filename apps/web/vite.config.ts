import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 57219,
    strictPort: true,
  },
  preview: {
    port: 57219,
    strictPort: true,
  },
  ssr: {
    external: ['better-sqlite3'],
    noExternal: ['@kotonoha/base'],
  },
})
