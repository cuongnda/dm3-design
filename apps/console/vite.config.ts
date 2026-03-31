import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api/v1/auth': { target: 'http://localhost:8005', changeOrigin: true },
      '/api/v1/system/devices': { target: 'http://localhost:8002', changeOrigin: true },
      '/api/v1/system': { target: 'http://localhost:8005', changeOrigin: true },
      '/api/v1/users': { target: 'http://localhost:8005', changeOrigin: true },
      '/api/v1/roles': { target: 'http://localhost:8005', changeOrigin: true },
      '/api/v1/devices': { target: 'http://localhost:8002', changeOrigin: true },
      '/ws/events': { 
        target: 'ws://localhost:8002', 
        ws: true 
      },
      '/api/v1/persons': { target: 'http://localhost:8004', changeOrigin: true },
      '/api/v1/groups': { target: 'http://localhost:8004', changeOrigin: true },
      '/api/v1/doors': { target: 'http://localhost:8003', changeOrigin: true },
      '/api/v1/rules': { target: 'http://localhost:8003', changeOrigin: true },
      '/api/v1/events': { target: 'http://localhost:8003', changeOrigin: true },
      '/api/v1/schedules': { target: 'http://localhost:8003', changeOrigin: true },
      '/api/v1/stats': { target: 'http://localhost:8003', changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    force: false,
  },
})
