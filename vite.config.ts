import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Manual multi-entry Vite config for Chrome MV3 extension.
// @crxjs/vite-plugin does not support Vite 8.x yet; manual config is used instead.
export default defineConfig({
  // base must be './' so that built popup.html references assets with relative paths.
  // Without this, Vite emits absolute paths (/assets/...) which Chrome's extension
  // page loader cannot resolve -- the popup would fail to mount.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@background': resolve(__dirname, 'src/background'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    rollupOptions: {
      input: {
        // Service worker entry
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        // Popup entry (HTML file at project root, not inside public/)
        popup: resolve(__dirname, 'popup.html'),
      },
      // NOTE: the content script is built separately (vite.config.content.ts) as a
      // self-contained IIFE. MV3 content scripts are classic scripts and cannot use
      // the `import` statements that this code-splitting multi-entry build emits.
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker') {
            return 'service-worker.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.includes('popup.html') || assetInfo.name === 'popup.html') {
            return 'popup.html';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  // Disable CSS code splitting so popup.css is inlined or bundled with popup
  cssCodeSplit: false,
});
