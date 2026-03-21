import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/trading-dashboard/',
  optimizeDeps: {
    include: ['lightweight-charts']
  }
})
