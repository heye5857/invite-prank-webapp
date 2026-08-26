/// <reference types="vitest" />
import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Embedded in the editor footer so anyone can tell WHICH deploy they run.
const GIT_HASH = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(GIT_HASH),
  },
  // Relative base: hash routing means assets resolve correctly both in dev,
  // on GitHub Pages project subpath (/repo-name/), and on Netlify/Vercel drops.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '來約我嘛 🥺',
        short_name: '來約我嘛',
        description: '把朋友騙出門的可愛整人邀請函',
        lang: 'zh-TW',
        theme_color: '#7c3aed',
        background_color: '#faf5ff',
        display: 'standalone',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    css: false,
    // e2e/ belongs to Playwright, not Vitest.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', 'scripts/**'],
  },
});
