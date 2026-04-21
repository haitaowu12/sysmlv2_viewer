import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { aiApiPlugin } from './server/vite-plugin.js'

export default defineConfig({
  base: '/sysmlv2_viewer/',
  plugins: [react(), aiApiPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-flow': ['@xyflow/react', '@dagrejs/dagre', 'dagre'],
          'vendor-monaco': ['@monaco-editor/react'],
        },
      },
    },
  },
})
