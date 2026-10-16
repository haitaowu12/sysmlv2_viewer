import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
// The shared renderer is owned outside this package. Resolve its donor runtime
// dependencies to this package's exact lockfile, rather than an ancestor install.
const dependency=path=>fileURLToPath(new URL('./node_modules/'+path,import.meta.url));
export default defineConfig({base:'./',resolve:{alias:[
 {find:'elkjs',replacement:dependency('elkjs')},
 {find:'libavoid-js',replacement:dependency('libavoid-js/dist/index.js')},
]},worker:{format:'es'},build:{rollupOptions:{input:{index:'index.html',probe:'probe.html',lab:'lab.html'}}}});
