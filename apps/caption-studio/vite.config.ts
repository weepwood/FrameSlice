import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// A library build lets Vue host the complete React editor in the same DOM
// document, without an iframe or navigation to another page.
export default defineConfig({
  base: '/FrameSlice/caption/',
  plugins: [react()],
  // In library mode Vite deliberately leaves process.env.NODE_ENV in some
  // bundled dependencies. Resolve it for the browser-only React island.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    target: 'es2022',
    outDir: '../../dist/caption',
    emptyOutDir: true,
    lib: {
      entry: 'src/embed.tsx',
      formats: ['es'],
      fileName: () => 'caption-workspace.js',
      cssFileName: 'caption-workspace',
    },
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers', '@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  test: { include: ['src/**/*.test.ts'] },
})
