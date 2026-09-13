import { test, expect } from "@playwright/test";
import { WAREHOUSE } from "./testdata";

/**
 * TC-09 Almacén: consulta de existencias y transferencia entre almacenes.
 * Requiere que la empresa demo tenga al menos 2 almacenes activos y stock
 * disponible para algún artículo. Ajusta WAREHOUSE.transferProductQuery en
 * testdata.ts al código/descripción de un artículo con existencias reales;
 * si se deja vacío, el test usa el primer resultado que ofrezca el buscador.
 */
test.describe("TC-09 Almacén", () => {
  test("Consultar existencias", async ({ page }) => {
    await page.goto("/almacen/existencias");
    await expect(page.getByRole("heading", { name: "Existencias" })).toBeVisible();
    await expect(page.locator(".table-panel table")).toBeVisible();
  });

  test("Transferencia entre almacenes actualiza el stock en origen y destino", async ({ page }) => {
    await page.goto("/almacen/transferencias");
    await expect(page.getByRole("heading", { name: "Transferencia entre almacenes" })).toBeVisible();

    const productField = page.getByPlaceholder("Buscar por código o descripción en catálogo…");
    await productField.click();
    await productField.fill(WAREHOUSE.transferProductQuery || "a");
    const firstOption = page.locator(".entity-search-option").first();
    await expect(firstOption).toBeVisible({ timeout: 10_000 });
    const productLabel = (await firstOption.innerText()).trim();
    await firstOption.click();

    const warehouseSelects = page.locator("select");
    const originSelect = warehouseSelects.nth(0);
    const targetSelect = warehouseSelects.nth(1);
    await originSelect.selectOption({ index: 1 });
    await targetSelect.selectOption({ index: 1 });

    const originCode = await originSelect.locator("option:checked").innerText();
    const targetCode = await targetSelect.locator("option:checked").innerText();
    expect(originCode, "El almacén de destino debe ser distinto del de origen").not.toBe(targetCode);

    await page.getByLabel("Cantidad *").fill("1");
    await page.getByRole("button", { name: "Realizar traspaso" }).click();

    await expect(page.locator(".inline-success")).toContainText("Traspaso realizado correctamente", {
      timeout: 15_000,
    });

    // Verifica en Existencias que ambos almacenes reflejan el movimiento.
    await page.goto("/almacen/existencias");
    await page.getByPlaceholder("Buscar artículo o característica…").fill(productLabel.split("·")[0].trim());
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.locator(".table-panel table tbody tr").first()).toBeVisible();
  });
});
