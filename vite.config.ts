import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { aiApiPlugin } from './server/vite-plugin.js'

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? './',
  plugins: [react(), aiApiPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-flow': ['@xyflow/react', '@dagrejs/dagre'],
          'vendor-monaco': ['@monaco-editor/react'],
        },
      },
    },
  },
})
