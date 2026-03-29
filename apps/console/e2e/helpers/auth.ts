import { Page } from '@playwright/test';

/**
 * Set auth state in localStorage so tests bypass the login API call.
 * Uses the same zustand persist key as the app ('dm3-auth').
 */
export async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    const state = {
      state: {
        user: {
          id: 'e2e-user',
          name: 'E2E Tester',
          email: 'e2e@test.com',
          role: 'admin',
          initials: 'E2',
        },
        isAuthenticated: true,
      },
      version: 0,
    };
    localStorage.setItem('dm3-auth', JSON.stringify(state));
    // Also set a fake token so getToken() returns truthy
    localStorage.setItem('dm3-token', 'fake-e2e-token');
    localStorage.setItem('dm3-refresh', 'fake-e2e-refresh');
  });
}
