import { test, expect } from '@playwright/test';

test('ONIN loads correctly', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('ONIN');
  await expect(page.locator('body')).toContainText('ONIN');
});

test('login form is available when authentication is required', async ({ page }) => {
  await page.goto('/');

  const email = page.getByPlaceholder('nombre@empresa.com');
  const password = page.getByPlaceholder('Tu contraseña');

  if (await email.count()) {
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  }
});
