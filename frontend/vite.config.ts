import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // VITE_BASE=/ for a site on its own domain (Firebase); GitHub Pages serves it under /sultane/.
  base: process.env.VITE_BASE || (process.env.GITHUB_ACTIONS ? '/sultane/' : '/'),
  plugins: [react(), tailwindcss()],
})
