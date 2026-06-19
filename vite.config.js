import { defineConfig } from 'vite';

const APP_VERSION = Date.now().toString();

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        // Standalone popup window loaded by the Tauri kitchen app.
        popup: 'popup.html',
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [{
    name: 'emit-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: APP_VERSION }),
      });
    },
  }],
});
