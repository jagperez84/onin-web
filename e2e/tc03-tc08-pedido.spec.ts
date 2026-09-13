import { test, expect, type Page } from "@playwright/test";
import { CATALOG } from "./testdata";

/**
 * TC-03 a TC-08: flujo completo presupuesto → pedido → fabricación →
 * montaje → factura/albarán → cobro. Cada test depende del resultado del
 * anterior (mismo presupuesto/pedido), por eso van en un único archivo con
 * describe.serial y variables compartidas en el ámbito del módulo.
 *
 * Requiere que la empresa demo tenga al menos un OTD activo en catálogo
 * (Producción / OTD). Si CATALOG.otdQuery está vacío se usa el primero de
 * la lista; si tu catálogo no tiene ninguno, ajusta CATALOG.otdQuery en
 * testdata.ts o adapta este archivo a un artículo simple.
 */

let quotationCode = "";
let quotationUrl = "";
let orderUrl = "";
let invoiceUrl = "";

async function createThrowawayCustomer(page: Page, legalName: string) {
  await page.goto("/ventas/clientes/nuevo");
  await page.getByLabel("Razón social *").fill(legalName);
  await page.getByLabel("CIF/NIF *").fill(`B${String(Date.now()).slice(-8)}`);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await page.waitForURL(/\/ventas\/clientes\/\d+$/, { timeout: 15_000 });
}

test.describe.serial("TC-03..TC-08 Flujo de pedido completo", () => {
  const customerName = `QA Pedido ${Date.now()}`;

  test("TC-03 Presupuesto con OTD", async ({ page }) => {
    await createThrowawayCustomer(page, customerName);

    await page.goto("/ventas/presupuestos/nuevo");
    await expect(page.getByRole("heading", { name: "Nuevo presupuesto" })).toBeVisible();

    const customerField = page.getByPlaceholder("Buscar cliente por nombre…");
    await customerField.click();
    await customerField.fill(customerName.slice(0, 10));
    await customerField.press("Enter");

    await page.getByRole("button", { name: "+ Añadir OTD / A Medida" }).click();
    const otdDialog = page.getByRole("dialog");
    await expect(otdDialog).toBeVisible();

    if (CATALOG.otdQuery) {
      await otdDialog.getByPlaceholder("Buscar OTD por nombre, código o tipo de producto…").fill(CATALOG.otdQuery);
    }
    // Selecciona la primera tarjeta de OTD disponible (estructura sin clase estable,
    // se localiza por el cursor de tarjeta clicable). Ajusta si tu catálogo lo requiere.
    await otdDialog.locator('[style*="cursor: pointer"]').first().click();

    // Rellena todas las dimensiones numéricas del configurador con un valor de prueba.
    const numberInputs = otdDialog.locator('input[type="number"]');
    const count = await numberInputs.count();
    for (let i = 0; i < count; i++) {
      const input = numberInputs.nth(i);
      if (await input.isEditable()) await input.fill("2000");
    }

    const confirmButton = otdDialog.getByRole("button", { name: /Insertar en Presupuesto|Actualizar Línea de Presupuesto/ });
    await expect(confirmButton).toBeEnabled({ timeout: 10_000 });
    await confirmButton.click();
    await expect(otdDialog).toBeHidden();

    // Verifica que la línea OTD quedó insertada con precio calculado (> 0).
    const priceInput = page.locator(".quotation-lines-table .line-num-input").nth(1);
    await expect(priceInput).not.toHaveValue("0");

    await page.getByRole("button", { name: "Crear presupuesto" }).click();
    await page.waitForURL(/\/ventas\/presupuestos$/, { timeout: 15_000 });

    const row = page.locator("tr", { hasText: customerName }).first();
    await expect(row).toBeVisible();
    quotationCode = (await row.locator("a").first().innerText()).trim();
    await row.locator("a").first().click();
    await page.waitForURL(/\/ventas\/presupuestos\/\d+$/);
    quotationUrl = page.url();
  });

  test("TC-04 Aceptar presupuesto y convertir a pedido", async ({ page }) => {
    test.skip(!quotationUrl, "TC-03 no generó un presupuesto.");
    await page.goto(quotationUrl);

    // El presupuesto nace en Borrador: hay que enviarlo antes de poder aceptarlo.
    await page.getByRole("button", { name: "Enviar por email" }).click();
    const emailDialog = page.getByRole("dialog");
    await expect(emailDialog).toBeVisible();
    await emailDialog.getByRole("button", { name: "Enviar y marcar como Enviado" }).click();
    await expect(emailDialog).toBeHidden({ timeout: 15_000 });
    await expect(page.locator(".quotation-status")).toHaveText("Enviado");

    await page.getByRole("button", { name: "Aceptar" }).click();
    const acceptDialog = page.getByRole("dialog");
    await acceptDialog.getByRole("button", { name: "Confirmar y marcar como Aceptado" }).click();
    await expect(acceptDialog).toBeHidden();
    await expect(page.locator(".quotation-status")).toHaveText("Aceptado");

    await page.getByRole("link", { name: "Crear pedido" }).click();
    await expect(page.getByRole("heading", { name: "Revisar pedido" })).toBeVisible();

    // Las líneas y precios deben coincidir con los del presupuesto de origen.
    await expect(page.locator(".sales-order-lines tbody tr")).toHaveCount(1);

    await page.getByRole("button", { name: "Guardar pedido" }).click();
    await page.waitForURL(/\/ventas\/pedidos\/\d+$/, { timeout: 15_000 });
    orderUrl = page.url();
  });

  test("TC-05 Fabricación", async ({ page }) => {
    test.skip(!orderUrl, "TC-04 no generó un pedido.");
    await page.goto(orderUrl);

    await page.getByRole("button", { name: "Fabricar pedido" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /^Fabricar/ })).toBeVisible();

    const bulkButton = dialog.getByRole("button", { name: /Fabricar pedido completo/ });
    // Si el botón está deshabilitado, la línea requiere selección manual de
    // pieza de stock (perfil de corte específico) que depende de tu catálogo:
    // ajusta este paso inspeccionando el modal en tu entorno.
    await expect(bulkButton).toBeEnabled({ timeout: 10_000 });
    await bulkButton.click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    await expect(page.locator(".quotation-status", { hasText: /Fabricado/ })).toBeVisible({ timeout: 15_000 });
  });

  test("TC-06 Instalación/montaje", async ({ page }) => {
    test.skip(!orderUrl, "TC-05 no dejó el pedido fabricado.");
    await page.goto(orderUrl);

    await page.getByRole("button", { name: /Programar visita/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /Programar visita de montaje/ })).toBeVisible();

    const lineChips = dialog.locator(".installation-installer-chip");
    if (await lineChips.count() > 0) await lineChips.first().click();

    await dialog.getByRole("button", { name: "Programar montaje" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.getByRole("button", { name: /Gestionar/ }).first().click();
    const manageDialog = page.getByRole("dialog");
    await manageDialog.getByLabel("Hora de fin").fill("12:30");
    await manageDialog.getByPlaceholder("p. ej. 1h30").fill("1h");
    await manageDialog.getByRole("button", { name: "Marcar montaje como completado" }).click();
    await expect(manageDialog).toBeHidden({ timeout: 15_000 });

    await expect(page.locator(".status-pill.success", { hasText: "Completado" })).toBeVisible();
  });

  test("TC-07 Factura y albarán", async ({ page }) => {
    test.skip(!orderUrl, "El pedido no está listo para facturar.");
    await page.goto(orderUrl);

    await page.getByRole("button", { name: "Generar factura" }).click();
    await expect(page.getByRole("link", { name: /^FRA/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: /^FRA/ }).click();
    await page.waitForURL(/\/facturacion\/facturas\/\d+$/);
    invoiceUrl = page.url();
    await expect(page.locator(".quotation-status")).toHaveText("Emitida");
    // Nota: a fecha de este scaffold, InvoiceDetail no expone descarga de PDF
    // (sí existe para presupuestos y hojas de trabajo) — no se comprueba aquí.

    await page.goto(orderUrl);
    const deliverButton = page.getByRole("button", { name: /Entregar todo lo pendiente/ });
    if (await deliverButton.isVisible().catch(() => false)) {
      await deliverButton.click();
      await expect(page.locator(".card-table", { hasText: "Albaranes" }).locator("tr").nth(1)).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("TC-08 Cobro", async ({ page }) => {
    test.skip(!invoiceUrl, "TC-07 no generó una factura.");
    await page.goto("/facturacion/cobros");
    await expect(page.getByRole("heading", { name: "Cobros" })).toBeVisible();

    const invoiceCode = invoiceUrl.split("/").pop();
    await page.getByPlaceholder("Buscar por factura o cliente…").fill(quotationCode || invoiceCode || "");

    const row = page.locator("tbody tr").first();
    await row.getByTitle("Marcar cobrado").click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Marcar cobrado" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.getByRole("combobox").selectOption("COLLECTED");
    await expect(page.locator("tbody tr").first().locator(".status-pill.success")).toHaveText("Cobrado");
  });
});
