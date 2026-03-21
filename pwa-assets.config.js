// pwa-assets.config.js
// Configuración del generador automático de iconos PWA.
// Lee el SVG fuente y genera todos los PNGs necesarios en public/icons/.

import { defineConfig } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  // 'minimal' genera: favicon, pwa-192, pwa-512 y apple-touch-icon
  preset: 'minimal',
  images: ['public/icons/icon.svg']
})
