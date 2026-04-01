import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow LAN access so you can test on your iPhone over Wi-Fi
    host: true,
    port: 5173,
    https: false, // set to true + add cert for on-device camera testing
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
