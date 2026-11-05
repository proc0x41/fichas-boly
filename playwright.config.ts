import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', channel: 'msedge', headless: true },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    env: { VITE_SUPABASE_URL: 'https://metrics-tests.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  },
})
