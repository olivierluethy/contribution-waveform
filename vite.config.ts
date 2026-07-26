import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'site',
  base: '/contribution-waveform/',
  // The generated SVGs are copied to the output root, so the deployed Pages
  // artifact is exactly this build — no separate copy step in the workflow.
  publicDir: resolve(here, 'dist'),
  build: {
    outDir: resolve(here, 'site-dist'),
    emptyOutDir: true,
  },
  plugins: [tailwindcss()],
});
