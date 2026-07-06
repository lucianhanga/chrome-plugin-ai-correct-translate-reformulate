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
//
// IIFE format allows only ONE entry per build, so this config is parameterised
// via env vars and invoked once per content script (content.ts and the static
// selection-toolbar.ts). Defaults build the main content.js.
const CONTENT_ENTRY = process.env.CONTENT_ENTRY ?? 'src/content/content.ts';
const CONTENT_FILE = process.env.CONTENT_FILE ?? 'content.js';
const CONTENT_NAME = process.env.CONTENT_NAME ?? '__correctTranslateContentScript';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@background': resolve(__dirname, 'src/background'),
    },
  },
  // Do NOT copy the public/ directory. This build runs AFTER the main build,
  // which has already emitted manifest.json + icons into the output directory.
  // For the test build the main build's closeBundle hook PATCHES the manifest
  // (adds 'http://localhost/*' to host_permissions). If this content build
  // copied public/ again it would overwrite that patched manifest with the
  // unpatched production one -- silently breaking content-script injection in
  // the e2e suite. publicDir: false prevents that clobber.
  publicDir: false,
  build: {
    outDir: process.env.CONTENT_OUT_DIR ?? 'dist',
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    lib: {
      entry: resolve(__dirname, CONTENT_ENTRY),
      formats: ['iife'],
      name: CONTENT_NAME,
      fileName: () => CONTENT_FILE,
    },
  },
});
