import { test, expect } from "@playwright/test";

/**
 * TC-11 Permisos por rol: en vez de dar por buenos los roles disponibles en
 * la empresa demo (no sabemos de antemano qué rol tiene el usuario de
 * pruebas), el test comprueba la CONSISTENCIA entre lo que el menú
 * (navSections en src/app/App.tsx) muestra y lo que la propia app permite
 * navegar. "/configuracion/usuarios" es el único punto con guardia real en
 * código (AdminOnly) y sirve como caso de referencia sin crear usuarios
 * adicionales.
 */
test.describe("TC-11 Permisos por rol", () => {
  test("el menú solo muestra los módulos que el rol puede usar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Inicio" })).toBeVisible();

    const navLinks = page.locator(".nav-scroll .nav-link");
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);

    const hrefs: string[] = [];
    for (let i = 0; i < count; i++) {
      const href = await navLinks.nth(i).getAttribute("href");
      if (href) hrefs.push(href);
    }

    const usersLinkVisible = hrefs.includes("/configuracion/usuarios");

    if (usersLinkVisible) {
      await page.getByRole("link", { name: "Usuarios" }).click();
      await expect(page).toHaveURL(/\/configuracion\/usuarios$/);
      await expect(page.locator(".module-page")).toBeVisible();
    } else {
      // Sin el enlace en el menú, forzar la URL directamente debe redirigir
      // a inicio (guardia AdminOnly en src/app/App.tsx).
      await page.goto("/configuracion/usuarios");
      await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    }

    // Todos los módulos listados en el menú deben ser accesibles sin acabar
    // redirigidos de vuelta a "/" (lo que delataría una inconsistencia entre
    // el menú y las rutas realmente permitidas para este rol).
    for (const href of hrefs) {
      if (href === "/") continue;
      await page.goto(href);
      await expect(page, `La ruta ${href} está en el menú pero redirige a inicio`).not.toHaveURL(/\/$/);
    }
  });
});
