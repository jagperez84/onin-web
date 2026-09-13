import { defineConfig, devices } from "@playwright/test";

/**
 * Batería de QA manual TC-01..TC-11 automatizada con Playwright.
 * Requiere .env con VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY apuntando
 * a un proyecto Supabase real (p. ej. la empresa demo ONIN-DEMO) y `npm run dev`
 * sirviendo la app en baseURL.
 *
 * Ejecutar:
 *   npx playwright test              # toda la batería, en orden
 *   npx playwright test tc03         # solo el archivo que matchea "tc03"
 *   npx playwright test --headed     # con navegador visible
 *   npx playwright test --ui         # modo UI interactivo
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
