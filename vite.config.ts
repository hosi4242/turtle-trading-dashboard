import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __DEMO_MODE__: JSON.stringify(mode === 'demo')
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
}))
