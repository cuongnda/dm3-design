import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const authFile = `${__dirname}/.auth/user.json`;

setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login');
  
  // Fill login form
  await page.fill('[data-testid="login-email"]', 'admin@duali.com');
  await page.fill('[data-testid="login-password"]', 'admin123');
  
  // Click login button
  await page.click('[data-testid="login-submit"]');
  
  // Wait for redirect to dashboard
  await page.waitForURL('/');
  
  // Verify we're logged in
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  
  // Save authentication state
  await page.context().storageState({ path: authFile });
});