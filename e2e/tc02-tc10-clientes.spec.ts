import { test, expect } from "@playwright/test";
import { CUSTOMER } from "./testdata";

// TC-02 y TC-10 comparten el mismo cliente: se crea en TC-02 y se borra
// (lógicamente) en TC-10, tal como pide la batería manual original.
test.describe.serial("TC-02 / TC-10 Clientes", () => {
  let customerId: string | null = null;

  test("TC-02 Alta de cliente", async ({ page }) => {
    await page.goto("/ventas/clientes/nuevo");
    await expect(page.getByRole("heading", { name: "Nuevo cliente" })).toBeVisible();

    await page.getByLabel("Razón social *").fill(CUSTOMER.legalName);
    await page.getByLabel("CIF/NIF *").fill(CUSTOMER.taxId);
    await page.getByLabel("Email", { exact: true }).fill(CUSTOMER.email);
    await page.getByLabel("Teléfono", { exact: true }).fill(CUSTOMER.phone);

    // Dirección
    await page.getByRole("button", { name: "Añadir dirección" }).click();
    await page.getByLabel("Dirección", { exact: true }).fill("Calle Prueba 1");
    await page.getByLabel("Localidad").fill("Málaga");
    await page.getByRole("button", { name: "Añadir dirección" }).last().click();

    // Contacto
    await page.getByRole("button", { name: "Añadir contacto" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Contacto");
    await page.getByLabel("Apellidos").fill("QA");
    await page.getByRole("button", { name: "Añadir contacto" }).last().click();

    await page.getByRole("button", { name: "Crear cliente" }).click();

    // Al guardar, navega al detalle: /ventas/clientes/:id
    await page.waitForURL(/\/ventas\/clientes\/\d+$/, { timeout: 15_000 });
    customerId = page.url().split("/").pop()!;
    await expect(page.getByRole("heading", { name: `Cliente ${customerId}` })).toBeVisible();

    await page.goto("/ventas/clientes");
    await page.getByPlaceholder("Buscar por nombre, CIF/NIF o código…").fill(CUSTOMER.legalName);
    const row = page.locator("tr", { hasText: CUSTOMER.legalName });
    await expect(row).toBeVisible();
    await expect(row.locator(".status.active")).toHaveText("Activo");
  });

  test("TC-10 Borrado lógico del cliente creado en TC-02", async ({ page }) => {
    test.skip(!customerId, "TC-02 no generó un id de cliente (¿falló antes?).");

    await page.goto(`/ventas/clientes/${customerId}`);
    await page.getByRole("button", { name: "Marcar para borrado" }).click();

    // Modal de confirmación (confirmDialog / ConfirmDialogHost), nunca window.confirm.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Confirmar" }).click();

    await expect(page.locator(".status.inactive")).toHaveText("Marcado para borrado");

    await page.goto("/ventas/clientes");
    await page.getByPlaceholder("Buscar por nombre, CIF/NIF o código…").fill(CUSTOMER.legalName);
    // Filtro por defecto es "Activos": el cliente marcado para borrado no debe aparecer.
    await expect(page.locator("tr", { hasText: CUSTOMER.legalName })).toHaveCount(0);

    await page.getByLabel("Estado").selectOption("deleted");
    await expect(page.locator("tr", { hasText: CUSTOMER.legalName }).locator(".status.inactive")).toHaveText(
      "Marcado para borrado",
    );
  });
});
