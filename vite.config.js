import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split big libraries into their own long-cached chunks so an app-code
        // change doesn't force browsers to re-download them.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
