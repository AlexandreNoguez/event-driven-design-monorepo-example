import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number.parseInt(env.VITE_USER_WEB_PORT ?? '5173', 10);
  const safePort = Number.isFinite(port) ? port : 5173;

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: safePort,
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0',
      port: safePort + 1000,
      strictPort: true,
    },
  };
});
