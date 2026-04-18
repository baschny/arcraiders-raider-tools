import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // amazon-cognito-identity-js references Node's `global`, which doesn't
    // exist in browsers. Map it to `globalThis` so the library loads.
    global: 'globalThis',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
