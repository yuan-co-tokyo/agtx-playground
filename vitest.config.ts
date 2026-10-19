import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'api', environment: 'node', include: ['tests/**/*.test.ts'] } },
      {
        plugins: [react()],
        test: {
          name: 'web', environment: 'jsdom', include: ['web/src/**/*.test.{ts,tsx}'],
          setupFiles: ['web/src/test/setup.ts'],
        },
      },
    ],
  },
});
