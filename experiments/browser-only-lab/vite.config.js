import {defineConfig} from 'vite';
export default defineConfig({base:'./',worker:{format:'es'},build:{rollupOptions:{input:{index:'index.html',probe:'probe.html',lab:'lab.html'}}}});
