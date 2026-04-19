import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        host: '0.0.0.0',
        port: 3000,
        allowedHosts: true,
        watch: {
            followSymlinks: true,
        },
        proxy: {
            '/api/v1/auth/': { target: 'http://localhost:8005', changeOrigin: true },
            '/api/v1/gateway/': { target: 'http://localhost:8002', changeOrigin: true },
            '/api/v1/access/': { target: 'http://localhost:8003', changeOrigin: true },
            '/api/v1/identity/': { target: 'http://localhost:8004', changeOrigin: true },
            '/api/v1/visitors/': { target: 'http://localhost:8006', changeOrigin: true },
            '/api/v1/attendance/': { target: 'http://localhost:8010', changeOrigin: true },
            '/api/v1/cctv/': { target: 'http://localhost:8008', changeOrigin: true },
            '/cctv/whep/': { target: 'http://localhost:8008', changeOrigin: true },
            '/cctv/hls/': { target: 'http://localhost:8008', changeOrigin: true },
            '/api/v1/audit/': { target: 'http://localhost:8001', changeOrigin: true },
            '/photos/': { target: 'http://localhost:8004', changeOrigin: true },
            '/assets/': { target: 'http://localhost:8003', changeOrigin: true },
            '/ws/': { target: 'ws://localhost:8002', ws: true },
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
});
