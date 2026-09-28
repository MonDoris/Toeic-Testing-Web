import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const api = 'http://localhost:5076'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/uploads': api,
    },
  },
  build: {
    // Build thẳng vào wwwroot của Api để chạy chung một cổng khi triển khai.
    outDir: '../src/ToeicPractice.Api/wwwroot',
    emptyOutDir: true,
  },
})
