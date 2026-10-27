import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let commitHash = '';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  commitHash = '';
}
const buildTime = new Date().toISOString().slice(0, 10);
const appVersion = commitHash || buildTime;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIME__: JSON.stringify(buildTime)
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'VTT Offline - Tablero Virtual de Rol',
        short_name: 'VTT Offline',
        description: 'Tablero virtual de rol offline para máster y segunda pantalla de jugadores',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: true
  }
});
