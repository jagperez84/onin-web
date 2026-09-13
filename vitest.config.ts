import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig({
  ...viteConfig,
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/tests/e2e/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
  },
});
