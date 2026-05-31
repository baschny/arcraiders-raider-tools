import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: [
      'node_modules/**',
      '.kilo/**',
      'dist/**',
      'infra/node_modules/**',
      'infra/**/*.js',
    ],
  },
});
