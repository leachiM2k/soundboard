import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const isProd = process.env.NODE_ENV === 'production';
const base = isProd ? '/soundboard/' : '/';

export default defineConfig({
  base,
  server: {
    allowedHosts: ['.ngrok-free.app'],
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'offline.html',
        navigateFallbackDenylist: [],
      },
      includeAssets: ['apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Soundboard',
        short_name: 'Soundboard',
        description: 'Record and play back sounds instantly.',
        display: 'standalone',
        start_url: base,
        scope: base,
        theme_color: '#1a1a2e',
        background_color: '#ff6b35',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
