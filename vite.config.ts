import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const root = process.cwd();

export default defineConfig({
  root: path.resolve(root, 'src/client'),
  plugins: [react()],
  appType: 'spa',
  build: {
    outDir: path.resolve(root, 'dist/client'),
    emptyOutDir: true,
  },
  server: {
    middlewareMode: true,
  },
});
