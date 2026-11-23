import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command, isPreview }) => ({
  plugins: [vue()],
  // vite preview also uses command='serve'. Keep the production Pages base in preview.
  base: command === 'serve' && isPreview !== true ? '/' : '/FrameSlice/',
  build: { target: 'es2022' },
  server: { proxy: { '/FrameSlice/subtitles': { target: 'http://127.0.0.1:5174', changeOrigin: true, ws: true } } },
}))
