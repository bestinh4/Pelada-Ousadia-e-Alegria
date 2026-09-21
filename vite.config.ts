import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/messaging'],
          'vendor-motion': ['motion/react'],
          'vendor-genai': ['@google/genai'],
        }
      }
    }
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  }
})
