import { test, expect } from "@playwright/test";
import { CREDENTIALS } from "./testdata";

// TC-01 necesita partir de una sesión limpia (no de e2e/.auth/user.json),
// ya que el objetivo es probar el propio formulario de login.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("TC-01 Login", () => {
  test("entra con el usuario y carga el dashboard sin errores en consola", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();

    await page.getByPlaceholder("nombre@empresa.com").fill(CREDENTIALS.email);
    await page.getByPlaceholder("Tu contraseña").fill(CREDENTIALS.password);
    await page.getByRole("button", { name: /^Entrar$/ }).click();

    const enterCompanyButton = page.getByRole("button", { name: "Entrar en la empresa" });
    if (await enterCompanyButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await enterCompanyButton.click();
    }

    await expect(page.getByRole("link", { name: "Inicio" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Resumen de gestión" })).toBeVisible();

    // Filtra el aviso conocido de Google Fonts bloqueado en entornos sandboxeados;
    // cualquier otro error de consola sí debe hacer fallar el test.
    const relevantErrors = consoleErrors.filter((e) => !e.includes("fonts.googleapis.com"));
    expect(relevantErrors, `Errores de consola inesperados:\n${relevantErrors.join("\n")}`).toEqual([]);
  });
});
