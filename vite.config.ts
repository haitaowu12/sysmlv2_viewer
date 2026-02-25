import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { aiApiPlugin } from './server/vite-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  base: '/sysmlv2_viewer/',
  plugins: [react(), aiApiPlugin()],
})
