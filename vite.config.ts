import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devAuth = env.VITE_DEV_AUTH === 'true';
  const localApiPort = env.VITE_LOCAL_API_PORT || '4000';

  // When running `npm run dev` with `VITE_DEV_AUTH=true`, forward
  // same-origin /me* calls to the local API server so the SPA can talk
  // to it without CORS when `VITE_API_BASE_URL` is left unset. Users who
  // prefer to target the local server by URL (the documented default)
  // set `VITE_API_BASE_URL=http://localhost:4000` and the proxy is a
  // harmless fall-through.
  const proxy = devAuth
    ? {
        '/me': { target: `http://localhost:${localApiPort}`, changeOrigin: true },
      }
    : undefined;

  return {
    plugins: [react()],
    define: {
      // amazon-cognito-identity-js references Node's `global`, which doesn't
      // exist in browsers. Map it to `globalThis` so the library loads.
      global: 'globalThis',
    },
    server: { proxy },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
