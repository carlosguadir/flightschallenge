import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      watch: { usePolling: env.VITE_USE_POLLING === 'true' },
      proxy: {
        '/api': { target: backendUrl, changeOrigin: true },
        '/socket.io': { target: backendUrl, ws: true, changeOrigin: true },
      },
    },
  };
});
