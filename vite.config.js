import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Base necesaria para GitHub Pages
  base: '/trading-dashboard/',
  optimizeDeps: {
    include: ['lightweight-charts']
  },

  plugins: [
    react(),

    VitePWA({
      // 'autoUpdate' recarga el SW silenciosamente cuando hay nueva versión.
      // Alternativa: 'prompt' — muestra un aviso al usuario.
      registerType: 'autoUpdate',

      // Incluir iconos y favicon en el precaché del Service Worker
      includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png', 'icons/pwa-192x192.png', 'icons/pwa-512x512.png'],

      // --- Manifest de la PWA ---
      manifest: {
        name: 'Trading Dashboard',
        short_name: 'Trading',
        description: 'Panel personal de seguimiento de operaciones e inversiones',
        lang: 'es',

        // Colores que usa el navegador/SO para la barra de título y splash screen
        theme_color: '#0d1117',
        background_color: '#0d1117',

        // 'standalone' = se abre sin barra de navegador, como app nativa
        display: 'standalone',

        // Orientación por defecto
        orientation: 'portrait',

        // Punto de entrada al abrir la app instalada
        start_url: '/trading-dashboard/',
        scope: '/trading-dashboard/',

        // Iconos para diferentes dispositivos
        icons: [
          {
            src: 'icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            // 'maskable' permite que Android recorte el icono en formas
            // (círculo, squircle...) sin bordes blancos feos
            src: 'icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },

      // --- Configuración del Service Worker (Workbox) ---
      workbox: {
        // Si la navegación falla (sin red), sirve el index.html cacheado
        navigateFallback: '/trading-dashboard/index.html',

        // Archivos que se precachean al instalar el SW
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // Rutas que el SW nunca debe interceptar
        // (las llamadas a Yahoo Finance, Firebase, Telegram van siempre a red)
        navigateFallbackDenylist: [/^\/api\//, /^https:\/\/corsproxy\.io/, /^https:\/\/.*\.googleapis\.com/, /^https:\/\/api\.telegram\.org/],

        // Caché para datos de Firebase — red primero, fallback a caché
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutos
              }
            }
          }
        ]
      },

      // Activar SW también en modo desarrollo para poder depurar
      devOptions: {
        enabled: true
      }
    })
  ]
})
