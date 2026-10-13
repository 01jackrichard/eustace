import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Prevent vite-plugin-pwa from re-adding manifest/public icons that are already matched by workbox.globPatterns
      includeManifestIcons: false,
      manifest: {
        name: 'Eustace',
        short_name: 'Eustace',
        description: 'A personal productivity system for turning intention into action.',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        start_url: '/',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,jpg,webp}'],
        // Defer the Landing-page decorative hero image (hero-hands-new.webp) to runtime caching.
        globIgnores: ['**/hero-hands-new.webp', '**/hero-hands-hd.png', '**/hero-hands-new.png'],
        // We do NOT want to cache Supabase requests!
        // Vite PWA automatically ignores cross-origin requests by default, 
        // but let's be explicit to only cache our own origin just in case.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Cache decorative Landing hero image on demand (same-origin only)
            urlPattern: /\/hero-hands-new\.webp$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'decorative-images-cache',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false // Don't enable in dev unless needed, can cause caching issues during development
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ['motion/react']
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Exact React runtime & routing core packages
            {
              name: 'vendor',
              test: /[/\\]node_modules[/\\](react|react-dom|scheduler|react-router|react-router-dom)[/\\]/,
            },
            // UI libraries, icons, and notifications
            {
              name: 'ui',
              test: /[/\\]node_modules[/\\](lucide-react|framer-motion|react-hot-toast)[/\\]/,
            },
            // Supabase client and auth/storage SDKs (evaluated before 'date' so shared tslib helpers stay in 'supabase')
            {
              name: 'supabase',
              test: /[/\\]node_modules[/\\]@supabase[/\\]/,
            },
            // Date manipulation & recurrence engine (loaded lazily only by routes that use date-fns/rrule)
            {
              name: 'date',
              test: /[/\\]node_modules[/\\](date-fns|rrule)[/\\]/,
            },
            // Notes editor (@tiptap/*, prosemirror-*) is intentionally omitted so Rollup/Rolldown
            // co-locates them with the lazy NoteEditorPage chunk.
          ]
        }
      }
    }
  }
})

