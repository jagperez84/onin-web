import { test as setup, expect } from "@playwright/test";
import { CREDENTIALS } from "./testdata";

const authFile = "e2e/.auth/user.json";

setup("autenticación", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("nombre@empresa.com").fill(CREDENTIALS.email);
  await page.getByPlaceholder("Tu contraseña").fill(CREDENTIALS.password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();

  // Si el usuario tiene varias empresas, aparece el selector de empresa.
  const enterCompanyButton = page.getByRole("button", { name: "Entrar en la empresa" });
  if (await enterCompanyButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await enterCompanyButton.click();
  }

  await expect(page.getByRole("link", { name: "Inicio" })).toBeVisible({ timeout: 15_000 });
  await page.context().storageState({ path: authFile });
});
