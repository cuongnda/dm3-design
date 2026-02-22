import { test, expect } from '@playwright/test';
import { injectAuth } from './helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
  });

  test('loads dashboard when authenticated', async ({ page }) => {
    await page.goto('/');
    // Should NOT redirect to login
    await expect(page).not.toHaveURL(/\/login/);
    // Main layout should be visible (sidebar + topbar + content)
    await expect(page.locator('main')).toBeVisible();
  });

  test('sidebar is visible with navigation items', async ({ page }) => {
    await page.goto('/');
    // The sidebar should have navigation links
    await expect(page.locator('nav, [class*="sidebar"], aside').first()).toBeVisible();
  });

  test('topbar is visible', async ({ page }) => {
    await page.goto('/');
    // Wait for layout to render
    await page.waitForLoadState('networkidle');
    // Topbar should contain search or user info
    await expect(page.locator('header, [class*="topbar"]').first()).toBeVisible();
  });
});
