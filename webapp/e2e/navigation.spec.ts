import { test, expect } from '@playwright/test';
import { injectAuth } from './helpers/auth';

const pages = [
  { path: '/', name: 'Dashboard' },
  { path: '/secure/access-control', name: 'Access Control' },
  { path: '/secure/cctv', name: 'CCTV' },
  { path: '/secure/intrusion', name: 'Intrusion' },
  { path: '/secure/intercom', name: 'Intercom' },
  { path: '/secure/ai-detection', name: 'AI Detection' },
  { path: '/secure/emergency', name: 'Emergency' },
  { path: '/manage/identities', name: 'Identities' },
  { path: '/manage/visitors', name: 'Visitors' },
  { path: '/manage/contractors', name: 'Contractors' },
  { path: '/manage/attendance', name: 'Attendance' },
  { path: '/manage/deliveries', name: 'Deliveries' },
  { path: '/manage/provisioning', name: 'Provisioning' },
  { path: '/operate/room-booking', name: 'Room Booking' },
  { path: '/operate/parking', name: 'Parking' },
  { path: '/operate/maintenance', name: 'Maintenance' },
  { path: '/operate/guard-tour', name: 'Guard Tour' },
  { path: '/operate/keys', name: 'Key Management' },
  { path: '/operate/iot-energy', name: 'IoT Energy' },
  { path: '/smart/ai-assistant', name: 'AI Assistant' },
  { path: '/smart/analytics', name: 'Analytics' },
  { path: '/smart/automation', name: 'Automation' },
  { path: '/devices', name: 'Devices' },
  { path: '/settings', name: 'Settings' },
];

test.describe('Navigation - All Pages Load', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
  });

  for (const { path, name } of pages) {
    test(`${name} page loads at ${path}`, async ({ page }) => {
      await page.goto(path);
      // Should not redirect to login
      await expect(page).not.toHaveURL(/\/login/);
      // Main content area should be present
      await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
      // No unhandled crash — page should have some content
      await expect(page.locator('body')).not.toHaveText('Application error');
    });
  }
});
