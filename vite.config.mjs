import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2021',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
})
