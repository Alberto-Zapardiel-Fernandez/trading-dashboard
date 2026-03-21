import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Nombre de tu repositorio en GitHub
  base: '/trading-dashboard/'
})
