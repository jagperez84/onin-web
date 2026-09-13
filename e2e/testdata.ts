/**
 * Datos de prueba de la batería TC-01..TC-11.
 * Ajusta los valores marcados con TODO según lo que exista realmente en tu
 * empresa demo (p. ej. ONIN-DEMO) antes de ejecutar la batería completa.
 */
export const CREDENTIALS = {
  email: process.env.QA_EMAIL || "testClaude@test.com",
  password: process.env.QA_PASSWORD || "Malaga00",
};

export const CUSTOMER = {
  legalName: `QA Playwright ${Date.now()}`,
  taxId: "B12345674", // NIF/CIF de prueba con dígito de control válido; cámbialo si tu validación lo rechaza
  email: "qa.playwright@example.com",
  phone: "600111222",
};

export const CATALOG = {
  // TODO: código o nombre de un artículo simple ya existente en el catálogo de tu empresa demo.
  productQuery: process.env.QA_PRODUCT_QUERY || "",
  // TODO: código o nombre de un OTD (producto técnico a medida) ya existente.
  otdQuery: process.env.QA_OTD_QUERY || "",
};

export const WAREHOUSE = {
  // TODO: código de un artículo con stock existente, para TC-09.
  transferProductQuery: process.env.QA_STOCK_PRODUCT_QUERY || "",
};
