// One-off config for building a single-file preview (not used in production builds).
// Usage: npm i -D --no-save vite-plugin-singlefile && npx vite build --config vite.preview.config.mjs
// Output: /tmp/preview-dist/index.html — open directly in a browser (file://), connects to live Firebase.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: '.',
  build: {
    outDir: '/tmp/preview-dist',
    emptyOutDir: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify('preview'),
  },
  plugins: [viteSingleFile()],
});
