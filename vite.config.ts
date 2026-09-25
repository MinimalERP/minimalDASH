import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  // GitHub Pages serves the site from /minimalDASH/; the Pages workflow sets VITE_BASE. Everywhere else it is the root.
  base: process.env['VITE_BASE'] ?? '/',
  build: { target: 'es2022', sourcemap: true },
});
