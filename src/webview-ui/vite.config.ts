import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

const root = resolve(__dirname);

export default defineConfig({
  plugins: [vue()],
  root,
  build: {
    outDir: resolve(__dirname, '../../media/webview'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        complexity: resolve(root, 'complexity/main.ts'),
        graph: resolve(root, 'graph/main.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
