import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

// Configure before React mounts an editor. Both the editor code and its worker
// are Vite assets served by the companion; no CDN bootstrap is required.
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  },
}
loader.config({ monaco })
