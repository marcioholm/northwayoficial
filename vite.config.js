import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        captacao: resolve(import.meta.dirname, 'captacao.html'),
        privacidade: resolve(import.meta.dirname, 'politica-de-privacidade.html')
      }
    }
  }
});
