import { test, expect } from '@playwright/test';
import { injectAuth } from './helpers/auth';

test.describe('Search Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('opens command palette with Cmd+K', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    // The command dialog should appear with search input
    await expect(page.locator('[cmdk-dialog], [role="dialog"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
  });

  test('shows page results in command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator('[cmdk-dialog], [role="dialog"]').first()).toBeVisible({ timeout: 5000 });
    // Should show "Pages" group with items
    await expect(page.locator('text=Pages')).toBeVisible();
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=Access Control')).toBeVisible();
  });

  test('can search and filter results', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 5000 });
    await page.locator('input[placeholder*="Search"]').fill('parking');
    // Parking should be visible, unrelated items should be filtered
    await expect(page.locator('[cmdk-item]:has-text("Parking")')).toBeVisible();
  });

  test('navigates to page when selecting from command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 5000 });
    await page.locator('input[placeholder*="Search"]').fill('CCTV');
    await page.locator('[cmdk-item]:has-text("CCTV")').click();
    await expect(page).toHaveURL(/\/secure\/cctv/);
  });

  test('closes command palette with Escape', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator('[cmdk-dialog], [role="dialog"]').first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('[cmdk-dialog], [role="dialog"]')).not.toBeVisible();
  });
});
