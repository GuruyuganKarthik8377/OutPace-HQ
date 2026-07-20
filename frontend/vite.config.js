import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/research': { target: 'http://localhost:8000', changeOrigin: true },
      '/health':   { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  optimizeDeps: {
    // Pre-bundle three.js and deduplicate react so react-globe.gl and
    // lucide-react share the same React instance (avoids "invalid hook call")
    include: ['three', 'react', 'react-dom'],
  },
  resolve: {
    // Force all packages to use a single copy of React
    dedupe: ['react', 'react-dom'],
    alias: {
      react:     path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
    },
  },
})
