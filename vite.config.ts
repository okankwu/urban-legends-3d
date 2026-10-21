import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // split big vendors so the browser can cache them across game updates
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('rapier')) return 'physics'
          if (id.includes('three') || id.includes('@react-three')) return 'three'
          return 'vendor'
        },
      },
    },
  },
})
