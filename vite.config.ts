import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = { '@core': fileURLToPath(new URL('./core', import.meta.url)) };

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: { alias },
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          environment: 'node',
          include: ['core/**/*.test.ts', 'fixtures/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'abnahme',
          environment: 'jsdom',
          include: ['abnahme/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test/setup.ts'],
          testTimeout: 60_000,
        },
      },
    ],
  },
});
