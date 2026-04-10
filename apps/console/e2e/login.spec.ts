import { test, expect } from '@playwright/test';

const mockTemporaryToken = 'temp-token';
const mockCompanyA = '00000000-0000-0000-0000-000000000001';
const mockCompanyB = '00000000-0000-0000-0000-000000000002';

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
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });

    await page.goto('/login');
    await page.locator('input[type="password"]').fill('wrong-password');
    await page.locator('button:has-text("Sign In")').click();
    await expect(page.locator('text=Invalid email or password')).toBeVisible({ timeout: 10000 });
  });

  test('completes the two-step company selection flow with tenant_id contract', async ({ page }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          step: 'select_company',
          temporary_token: mockTemporaryToken,
          user: {
            id: 'multi-company-user',
            name: 'Multi Company User',
            email: 'multi@test.com',
          },
          companies: [
            { id: mockCompanyA, name: 'Alpha Co', code: 'ALPHA', role: 'primary_manager', logo_url: null },
            { id: mockCompanyB, name: 'Beta Co', code: 'BETA', role: 'viewer', logo_url: null },
          ],
        }),
      });
    });

    await page.route('**/api/v1/auth/login-step2', async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toEqual({
        temporary_token: mockTemporaryToken,
        tenant_id: mockCompanyB,
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          step: 'complete',
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          user: {
            id: 'multi-company-user',
            name: 'Multi Company User',
            email: 'multi@test.com',
            role: 'viewer',
            tenant_id: mockCompanyB,
          },
        }),
      });
    });

    await page.route('**/api/v1/auth/tenant/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenant: {
            id: mockCompanyB,
            company_id: mockCompanyB,
            company_name: 'Beta Co',
            company_code: 'BETA',
            plan: 'starter',
            status: 'active',
            max_devices: 50,
            max_users: 20,
          },
        }),
      });
    });

    await page.route('**/api/v1/auth/tenant/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          usage: {
            devices: { current: 1, limit: 50 },
            users: { current: 2, limit: 20 },
            persons: { current: 3, limit: 100 },
          },
        }),
      });
    });

    await page.route('**/api/v1/access/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          doors_online: 0,
          doors_offline: 0,
          doors_alarm: 0,
          doors_total: 0,
          events_today: 0,
          granted_today: 0,
          denied_today: 0,
          recent_events: [],
        }),
      });
    });

    await page.goto('/login');
    await page.locator('input[type="email"]').fill('multi@test.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.locator('[data-testid="login-button-submit"]').click();

    await expect(page.locator('text=Alpha Co')).toBeVisible();
    await expect(page.locator('text=Beta Co')).toBeVisible();

    await page.locator(`[data-testid="login-button-company-${mockCompanyB}"]`).click();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('main')).toBeVisible();
    const token = await page.evaluate(() => localStorage.getItem('dm3-token'));
    expect(token).toBe('access-token');
  });
});
