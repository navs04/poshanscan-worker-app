import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // We ship our own public/manifest.json (linked from index.html).
      manifest: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        // Precache the app shell so the app opens with no network at all.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Skip font subsets a Latin-script UI never requests.
        globIgnores: [
          '**/*-{latin-ext,vietnamese,cyrillic,cyrillic-ext,greek,greek-ext}-*.woff2',
        ],
        navigateFallback: '/index.html',
        // API calls go cross-origin straight to the backend; the SW never caches them.
      },
    }),
  ],
  server: { port: 5173, host: true },
})
