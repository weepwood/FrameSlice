import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/FrameSlice/subtitles/',
  plugins: [react()],
  build: { outDir: '../../dist/subtitles', emptyOutDir: false },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers', '@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  test: { include: ['src/**/*.test.ts'] }
});
