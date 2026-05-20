import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';

// Test-only Vite build configuration.
//
// Differences from the production build (vite.config.ts):
//   - outDir: 'dist-test' (never overwrites 'dist/')
//   - A post-build manifest patch adds 'http://localhost/*' to host_permissions
//     so that chrome.scripting.executeScript can inject the content script into
//     HTTP-served test pages without requiring activeTab.
//
// The production public/manifest.json and dist/ directory are NEVER modified.

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      // Custom plugin: after the build finishes, copy the production manifest
      // into dist-test/ and patch it with the extra host permission.
      name: 'patch-test-manifest',
      closeBundle() {
        const srcManifest = resolve(__dirname, 'public', 'manifest.json');
        const destDir = resolve(__dirname, 'dist-test');
        const destManifest = resolve(destDir, 'manifest.json');

        mkdirSync(destDir, { recursive: true });

        // Read the production manifest (source of truth -- never mutated).
        const manifest = JSON.parse(readFileSync(srcManifest, 'utf-8')) as {
          host_permissions?: string[];
          [key: string]: unknown;
        };

        // Extend host_permissions with the test-server origin.
        // 'http://localhost/*' covers the static server on any port.
        const existing: string[] = manifest.host_permissions ?? [];
        if (!existing.includes('http://localhost/*')) {
          manifest.host_permissions = [...existing, 'http://localhost/*'];
        }

        writeFileSync(destManifest, JSON.stringify(manifest, null, 2), 'utf-8');
        console.log('[vite.config.test] Patched manifest written to dist-test/manifest.json');
      },
    },
  ],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@background': resolve(__dirname, 'src/background'),
    },
  },
  build: {
    // Test build goes to a separate directory -- production dist/ is untouched.
    outDir: 'dist-test',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        popup: resolve(__dirname, 'popup.html'),
      },
      // The content script is built separately (vite.config.content.ts) as a
      // self-contained IIFE -- MV3 content scripts cannot use `import`.
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker') return 'service-worker.js';
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
  cssCodeSplit: false,
});
