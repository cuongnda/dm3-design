import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('shows login page with form fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=DUALL MASTER 3.0')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign In")')).toBeVisible();
  });

  test('email field is pre-filled with default value', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toHaveValue('admin@duali.com');
  });

  test('has SSO button and forgot password link', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Sign in with SSO')).toBeVisible();
    await expect(page.locator('text=Forgot password?')).toBeVisible();
  });

  test('password visibility toggle works', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.locator('input[placeholder="Password"]');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click the eye toggle button
    await page.locator('input[placeholder="Password"] + button, input[placeholder="Password"] ~ button').first().click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows error on invalid login attempt', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="password"]').fill('wrong-password');
    await page.locator('button:has-text("Sign In")').click();
    // The API call will fail (no backend), should show error
    await expect(page.locator('text=Invalid email or password')).toBeVisible({ timeout: 10000 });
  });
});
