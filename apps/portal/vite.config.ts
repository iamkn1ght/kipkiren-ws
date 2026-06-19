import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy target — defaults to a local API; override to hit a remote API
// (e.g. VITE_PROXY_TARGET=https://api.ws.kipkiren.co.ke). The Origin header is
// stripped so a remote API whose CORS allow-list omits localhost still accepts
// the proxied request.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': {
        target: proxyTarget,
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
