import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works on GitHub Pages (/lega-os/) and Vercel alike.
export default defineConfig({
  base: './',
  plugins: [react()],
})
