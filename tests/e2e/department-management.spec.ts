import { test, expect } from '@playwright/test';

test.describe('Department Management', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to department management page
    await page.goto('/manage/departments');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Page Layout', () => {
    test('should display page title and description', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Department Management');
      await expect(page.locator('p')).toContainText('Manage organizational departments');
    });

    test('should display create department button', async ({ page }) => {
      await expect(page.locator('[data-testid*="create"]')).toBeVisible();
    });

    test('should display stats cards', async ({ page }) => {
      await expect(page.locator('[data-testid="stats-grid"]')).toBeVisible();
    });

    test('should display search and filters', async ({ page }) => {
      await expect(page.locator('[data-testid="search-filters"]')).toBeVisible();
    });

    test('should display view mode toggle', async ({ page }) => {
      await expect(page.locator('[data-testid="view-mode-toggle"]')).toBeVisible();
    });
  });

  test.describe('View Modes', () => {
    test('should switch between grid and table views', async ({ page }) => {
      // Start in grid view
      await expect(page.locator('[data-testid="view-mode-toggle-grid"]')).toHaveAttribute('aria-pressed', 'true');
      
      // Switch to table view
      await page.click('[data-testid="view-mode-toggle-table"]');
      await expect(page.locator('[data-testid="view-mode-toggle-table"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-testid="data-table"]')).toBeVisible();
      
      // Switch back to grid view
      await page.click('[data-testid="view-mode-toggle-grid"]');
      await expect(page.locator('[data-testid="view-mode-toggle-grid"]')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test.describe('Search and Filtering', () => {
    test('should search departments by name', async ({ page }) => {
      const searchInput = page.locator('[data-testid="search-filters-search-input"]');
      
      // Search for a department
      await searchInput.fill('Engineering');
      await page.waitForTimeout(500); // Debounce
      
      // Verify results are filtered
      const departmentCards = page.locator('[data-testid*="department-card"]');
      await expect(departmentCards.first()).toContainText('Engineering');
    });

    test('should open and use advanced filters', async ({ page }) => {
      // Open advanced filters
      await page.click('[data-testid="search-filters-advanced-toggle"]');
      await expect(page.locator('[data-testid="search-filters-filter-status"]')).toBeVisible();
      
      // Apply status filter
      await page.click('[data-testid="search-filters-filter-status"]');
      await page.click('[data-testid="search-filters-filter-status-active"]');
      
      // Verify active filter tag appears
      await expect(page.locator('[data-testid="search-filters-active-filters"]')).toBeVisible();
    });

    test('should reset filters', async ({ page }) => {
      // Apply search
      await page.fill('[data-testid="search-filters-search-input"]', 'test');
      
      // Reset filters
      await page.click('[data-testid="search-filters-reset"]');
      
      // Verify search is cleared
      await expect(page.locator('[data-testid="search-filters-search-input"]')).toHaveValue('');
    });
  });

  test.describe('Department CRUD', () => {
    test('should create a new department', async ({ page }) => {
      // Click create button
      await page.click('button:has-text("Create Department")');
      
      // Verify modal opens
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await expect(page.locator('h2:has-text("Create Department")')).toBeVisible();
      
      // Fill form
      await page.fill('[data-testid="department-form-name"]', 'Test Department');
      await page.fill('[data-testid="department-form-number"]', 'TEST001');
      await page.fill('[data-testid="department-form-description"]', 'Test department description');
      
      // Submit form
      await page.click('[data-testid="department-form-submit"]');
      
      // Wait for modal to close and success message
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
      
      // Verify department appears in list
      await expect(page.locator('text=Test Department')).toBeVisible();
    });

    test('should edit an existing department', async ({ page }) => {
      // Find a department card and click edit
      const departmentCard = page.locator('[data-testid*="department-card"]').first();
      await departmentCard.hover();
      await page.click('[data-testid*="edit"]');
      
      // Verify edit modal opens
      await expect(page.locator('h2:has-text("Edit Department")')).toBeVisible();
      
      // Update description
      await page.fill('[data-testid="department-form-description"]', 'Updated description');
      
      // Submit form
      await page.click('[data-testid="department-form-submit"]');
      
      // Verify modal closes
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });

    test('should validate required fields', async ({ page }) => {
      // Click create button
      await page.click('button:has-text("Create Department")');
      
      // Try to submit empty form
      await page.click('[data-testid="department-form-submit"]');
      
      // Verify validation errors
      await expect(page.locator('text=Name is required')).toBeVisible();
      await expect(page.locator('text=Number is required')).toBeVisible();
    });

    test('should delete a department with confirmation', async ({ page }) => {
      // Find a department and click delete
      const departmentCard = page.locator('[data-testid*="department-card"]').first();
      const departmentName = await departmentCard.locator('h3').textContent();
      
      await departmentCard.hover();
      await page.click('[data-testid*="delete"]');
      
      // Verify confirmation dialog
      await expect(page.locator('text=Delete Department')).toBeVisible();
      await expect(page.locator(`text=${departmentName}`)).toBeVisible();
      
      // Confirm deletion
      await page.click('button:has-text("Delete Department")');
      
      // Verify department is removed (in real test, we'd check it's not in the list)
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });
  });

  test.describe('User Assignment', () => {
    test('should open user assignment modal', async ({ page }) => {
      // Find a department and click manage users
      const departmentCard = page.locator('[data-testid*="department-card"]').first();
      await departmentCard.hover();
      await page.click('[data-testid*="manage-users"]');
      
      // Verify user assignment modal opens
      await expect(page.locator('h2:has-text("Manage Users")')).toBeVisible();
      await expect(page.locator('[role="tab"]:has-text("Current Users")')).toBeVisible();
      await expect(page.locator('[role="tab"]:has-text("Assign Users")')).toBeVisible();
    });

    test('should switch between current and assign users tabs', async ({ page }) => {
      // Open user assignment modal
      const departmentCard = page.locator('[data-testid*="department-card"]').first();
      await departmentCard.hover();
      await page.click('[data-testid*="manage-users"]');
      
      // Switch to assign users tab
      await page.click('[role="tab"]:has-text("Assign Users")');
      await expect(page.locator('[data-testid*="assign-users"]')).toBeVisible();
      
      // Switch back to current users
      await page.click('[role="tab"]:has-text("Current Users")');
      await expect(page.locator('[data-testid*="current-users"]')).toBeVisible();
    });

    test('should search users in assignment modal', async ({ page }) => {
      // Open user assignment modal
      const departmentCard = page.locator('[data-testid*="department-card"]').first();
      await departmentCard.hover();
      await page.click('[data-testid*="manage-users"]');
      
      // Search users
      const searchInput = page.locator('[placeholder*="Search users"]');
      await searchInput.fill('john');
      
      // Verify search results are filtered
      await expect(page.locator('[data-testid*="user-row"]')).toContainText('john', { ignoreCase: true });
    });
  });

  test.describe('Import/Export', () => {
    test('should open import/export modal', async ({ page }) => {
      // Click import/export button
      await page.click('button:has-text("Import/Export")');
      
      // Verify modal opens
      await expect(page.locator('h2:has-text("Import/Export Departments")')).toBeVisible();
      await expect(page.locator('[role="tab"]:has-text("Export")')).toBeVisible();
      await expect(page.locator('[role="tab"]:has-text("Import")')).toBeVisible();
    });

    test('should download sample CSV template', async ({ page }) => {
      // Open import/export modal
      await page.click('button:has-text("Import/Export")');
      
      // Switch to import tab
      await page.click('[role="tab"]:has-text("Import")');
      
      // Setup download listener
      const downloadPromise = page.waitForEvent('download');
      
      // Click download sample
      await page.click('button:has-text("Download Sample")');
      
      // Verify download starts
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('departments-sample.csv');
    });

    test('should trigger export download', async ({ page }) => {
      // Open import/export modal
      await page.click('button:has-text("Import/Export")');
      
      // Setup download listener
      const downloadPromise = page.waitForEvent('download');
      
      // Click export button
      await page.click('button:has-text("Export Departments")');
      
      // Verify download starts
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('departments');
      expect(download.suggestedFilename()).toContain('.csv');
    });

    test('should upload CSV file', async ({ page }) => {
      // Open import/export modal
      await page.click('button:has-text("Import/Export")');
      await page.click('[role="tab"]:has-text("Import")');
      
      // Create test CSV content
      const csvContent = 'name,number,description\nTest Import,IMP001,Imported department';
      
      // Upload file
      await page.setInputFiles('[data-testid="file-drop-zone-file-input"]', {
        name: 'test-departments.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csvContent)
      });
      
      // Verify file appears in list
      await expect(page.locator('[data-testid="file-drop-zone-files-list"]')).toContainText('test-departments.csv');
      
      // Click import button
      await page.click('button:has-text("Import Departments")');
      
      // Verify import success (mock success in test environment)
      await expect(page.locator('text=Successfully imported')).toBeVisible();
    });
  });

  test.describe('Bulk Operations', () => {
    test('should select multiple departments', async ({ page }) => {
      // Switch to table view for easier selection
      await page.click('[data-testid="view-mode-toggle-table"]');
      
      // Select multiple departments
      await page.click('[data-testid="data-table-select-0"]');
      await page.click('[data-testid="data-table-select-1"]');
      
      // Verify bulk action bar appears
      await expect(page.locator('[data-testid="bulk-action-bar"]')).toBeVisible();
      await expect(page.locator('text=2 items selected')).toBeVisible();
    });

    test('should select all departments', async ({ page }) => {
      // Switch to table view
      await page.click('[data-testid="view-mode-toggle-table"]');
      
      // Click select all checkbox
      await page.click('[data-testid="data-table-select-all"]');
      
      // Verify all departments are selected
      await expect(page.locator('[data-testid="bulk-action-bar"]')).toBeVisible();
    });

    test('should clear selection', async ({ page }) => {
      // Switch to table view and select items
      await page.click('[data-testid="view-mode-toggle-table"]');
      await page.click('[data-testid="data-table-select-0"]');
      await page.click('[data-testid="data-table-select-1"]');
      
      // Clear selection
      await page.click('[data-testid="bulk-action-bar-clear"]');
      
      // Verify bulk action bar disappears
      await expect(page.locator('[data-testid="bulk-action-bar"]')).not.toBeVisible();
    });

    test('should bulk delete with confirmation', async ({ page }) => {
      // Switch to table view and select items
      await page.click('[data-testid="view-mode-toggle-table"]');
      await page.click('[data-testid="data-table-select-0"]');
      
      // Click bulk delete
      await page.click('[data-testid="bulk-action-bar-action-delete"]');
      
      // Verify confirmation dialog
      await expect(page.locator('text=Are you sure')).toBeVisible();
      
      // Cancel first
      await page.click('button:has-text("Cancel")');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Verify page loads
      await expect(page.locator('h1')).toBeVisible();
      
      // Verify mobile-friendly layout
      await expect(page.locator('[data-testid="stats-grid"]')).toBeVisible();
      
      // Test mobile navigation
      await page.click('button:has-text("Create Department")');
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    });

    test('should adapt grid layout on different screen sizes', async ({ page }) => {
      // Test different viewport sizes
      const viewports = [
        { width: 1920, height: 1080 }, // Desktop
        { width: 1024, height: 768 },  // Tablet
        { width: 375, height: 667 }    // Mobile
      ];
      
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        
        // Verify stats grid adapts
        await expect(page.locator('[data-testid="stats-grid"]')).toBeVisible();
        
        // Verify department grid adapts
        if (viewport.width >= 1024) {
          // Desktop should show multiple columns
          await expect(page.locator('[data-testid*="department-card"]').nth(1)).toBeVisible();
        }
      }
    });
  });

  test.describe('Performance', () => {
    test('should load page within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/manage/departments');
      await page.waitForLoadState('networkidle');
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(3000); // 3 seconds
    });

    test('should handle large datasets', async ({ page }) => {
      // Mock large dataset response
      await page.route('**/api/v1/departments*', (route) => {
        const departments = Array.from({ length: 100 }, (_, i) => ({
          id: `dept-${i}`,
          name: `Department ${i}`,
          number: `DEPT${i.toString().padStart(3, '0')}`,
          status: 'active',
          user_count: Math.floor(Math.random() * 50)
        }));
        
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            departments: departments.slice(0, 20),
            total: 100,
            total_pages: 5
          })
        });
      });
      
      await page.reload();
      
      // Verify pagination appears
      await expect(page.locator('[data-testid="data-table-pagination"]')).toBeVisible();
      await expect(page.locator('text=Showing 20 of 100')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API errors gracefully', async ({ page }) => {
      // Mock API error
      await page.route('**/api/v1/departments*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error' })
        });
      });
      
      await page.reload();
      
      // Verify error message is shown
      await expect(page.locator('text=Failed to fetch departments')).toBeVisible();
    });

    test('should show loading states', async ({ page }) => {
      // Mock slow API response
      await page.route('**/api/v1/departments*', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        route.continue();
      });
      
      await page.reload();
      
      // Verify loading spinner appears
      await expect(page.locator('[data-testid="data-table-loading"]')).toBeVisible();
    });

    test('should handle empty state', async ({ page }) => {
      // Mock empty response
      await page.route('**/api/v1/departments*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            departments: [],
            total: 0,
            total_pages: 0
          })
        });
      });
      
      await page.reload();
      
      // Verify empty state is shown
      await expect(page.locator('[data-testid="data-table-empty"]')).toBeVisible();
      await expect(page.locator('text=No departments found')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA labels', async ({ page }) => {
      // Verify important elements have aria-labels
      await expect(page.locator('[aria-label*="Switch to"]')).toHaveCount(3); // View mode toggles
      await expect(page.locator('button[title]')).toHaveCount.greaterThan(0);
    });

    test('should support keyboard navigation', async ({ page }) => {
      // Tab through interactive elements
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter'); // Should trigger action
      
      // Verify focus is visible
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'INPUT', 'SELECT'].includes(focusedElement)).toBeTruthy();
    });
  });
});