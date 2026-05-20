import { defineConfig } from 'vite';
import { resolve } from 'path';

// Dedicated build for the MV3 content script.
//
// Content scripts are injected as CLASSIC scripts -- not ES modules -- so they
// cannot contain `import` statements. The main multi-entry build (vite.config.ts)
// code-splits shared modules (constants, errors) into chunks that each entry
// imports; that is correct for the service worker and popup (both ES modules)
// but produces an illegal `import` in content.js ("Cannot use import statement
// outside a module").
//
// This build bundles content.ts and ALL its dependencies into a single IIFE
// file with no imports. It runs AFTER the main build (emptyOutDir: false) so it
// only adds content.js without wiping service-worker.js / popup.html.
//
// CONTENT_OUT_DIR selects the target directory: 'dist' (production build) or
// 'dist-test' (e2e test build). content.js is identical for both.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@background': resolve(__dirname, 'src/background'),
    },
  },
  build: {
    outDir: process.env.CONTENT_OUT_DIR ?? 'dist',
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    lib: {
      entry: resolve(__dirname, 'src/content/content.ts'),
      formats: ['iife'],
      name: '__correctTranslateContentScript',
      fileName: () => 'content.js',
    },
  },
});
