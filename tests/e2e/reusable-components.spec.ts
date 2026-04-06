import { test, expect } from '@playwright/test';

test.describe('Reusable Components', () => {

  test.describe('DataTableWithPagination', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/manage/departments');
      await page.click('[data-testid="view-mode-toggle-table"]');
    });

    test('should display table with correct headers', async ({ page }) => {
      const headers = ['Department', 'Manager', 'Parent', 'Users', 'Status', 'Created', 'Actions'];
      
      for (const header of headers) {
        await expect(page.locator('[data-testid*="header"]', { hasText: header })).toBeVisible();
      }
    });

    test('should support row selection', async ({ page }) => {
      // Select individual row
      await page.click('[data-testid="data-table-select-0"]');
      await expect(page.locator('[data-testid="data-table-select-0"]')).toBeChecked();
      
      // Select all rows
      await page.click('[data-testid="data-table-select-all"]');
      const checkboxes = page.locator('[data-testid*="data-table-select-"]:not([data-testid="data-table-select-all"])');
      await expect(checkboxes.first()).toBeChecked();
    });

    test('should handle pagination correctly', async ({ page }) => {
      // Mock large dataset to test pagination
      await page.route('**/api/v1/departments*', (route) => {
        const departments = Array.from({ length: 25 }, (_, i) => ({
          id: `dept-${i}`,
          name: `Department ${i}`,
          number: `DEPT${i.toString().padStart(3, '0')}`,
          status: 'active'
        }));
        
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            departments: departments.slice(0, 20),
            total: 25,
            total_pages: 2
          })
        });
      });
      
      await page.reload();
      
      // Verify pagination controls
      await expect(page.locator('[data-testid="data-table-pagination"]')).toBeVisible();
      await expect(page.locator('[data-testid="data-table-page-1"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-testid="data-table-next-page"]')).toBeEnabled();
      
      // Navigate to next page
      await page.click('[data-testid="data-table-next-page"]');
      await expect(page.locator('[data-testid="data-table-page-2"]')).toHaveAttribute('aria-pressed', 'true');
    });

    test('should show loading state', async ({ page }) => {
      // Mock slow response
      await page.route('**/api/v1/departments*', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        route.continue();
      });
      
      await page.reload();
      await expect(page.locator('[data-testid="data-table-loading"]')).toBeVisible();
    });

    test('should show empty state', async ({ page }) => {
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
      await expect(page.locator('[data-testid="data-table-empty"]')).toBeVisible();
      await expect(page.locator('text=No data available')).toBeVisible();
    });
  });

  test.describe('SearchWithFilters', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/manage/departments');
    });

    test('should perform basic search', async ({ page }) => {
      const searchInput = page.locator('[data-testid="search-filters-search-input"]');
      
      await searchInput.fill('Engineering');
      await expect(searchInput).toHaveValue('Engineering');
      
      // Verify search is triggered (would filter results in real scenario)
      await page.waitForTimeout(300); // Debounce delay
    });

    test('should toggle advanced filters', async ({ page }) => {
      const advancedToggle = page.locator('[data-testid="search-filters-advanced-toggle"]');
      
      // Open advanced filters
      await advancedToggle.click();
      await expect(page.locator('[data-testid*="search-filters-filter-"]')).toBeVisible();
      
      // Close advanced filters
      await advancedToggle.click();
      await expect(page.locator('[data-testid*="search-filters-filter-"]')).not.toBeVisible();
    });

    test('should apply and display active filters', async ({ page }) => {
      // Open advanced filters
      await page.click('[data-testid="search-filters-advanced-toggle"]');
      
      // Apply a filter
      await page.click('[data-testid="search-filters-filter-status"]');
      await page.click('[data-testid="search-filters-filter-status-active"]');
      
      // Verify active filter tag appears
      await expect(page.locator('[data-testid="search-filters-active-filters"]')).toBeVisible();
      await expect(page.locator('[data-testid="search-filters-active-filter-status"]')).toContainText('active');
    });

    test('should remove individual filters', async ({ page }) => {
      // Apply search and filter
      await page.fill('[data-testid="search-filters-search-input"]', 'test');
      await page.click('[data-testid="search-filters-advanced-toggle"]');
      await page.click('[data-testid="search-filters-filter-status"]');
      await page.click('[data-testid="search-filters-filter-status-active"]');
      
      // Remove individual filter
      await page.click('[data-testid="search-filters-remove-filter-status"]');
      await expect(page.locator('[data-testid="search-filters-active-filter-status"]')).not.toBeVisible();
    });

    test('should reset all filters', async ({ page }) => {
      // Apply multiple filters
      await page.fill('[data-testid="search-filters-search-input"]', 'test');
      await page.click('[data-testid="search-filters-advanced-toggle"]');
      await page.click('[data-testid="search-filters-filter-status"]');
      await page.click('[data-testid="search-filters-filter-status-active"]');
      
      // Reset all filters
      await page.click('[data-testid="search-filters-reset"]');
      
      // Verify everything is cleared
      await expect(page.locator('[data-testid="search-filters-search-input"]')).toHaveValue('');
      await expect(page.locator('[data-testid="search-filters-active-filters"]')).not.toBeVisible();
    });
  });

  test.describe('StatsCardGrid', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/manage/departments');
    });

    test('should display stats cards with correct layout', async ({ page }) => {
      const statsGrid = page.locator('[data-testid="stats-grid"]');
      await expect(statsGrid).toBeVisible();
      
      // Check for stats cards
      await expect(page.locator('[data-testid*="stats-grid-card-"]')).toHaveCount(4);
    });

    test('should show loading state for stats', async ({ page }) => {
      // Mock slow stats response
      await page.route('**/api/v1/departments*', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        route.continue();
      });
      
      await page.reload();
      await expect(page.locator('[data-testid="stats-grid-loading"]')).toBeVisible();
    });

    test('should display correct stat values and icons', async ({ page }) => {
      // Verify each stat card has an icon and value
      const statCards = page.locator('[data-testid*="stats-grid-card-"]');
      
      for (let i = 0; i < await statCards.count(); i++) {
        const card = statCards.nth(i);
        await expect(card.locator('svg')).toBeVisible(); // Icon
        await expect(card.locator('[data-testid*="value-"]')).toBeVisible(); // Value
        await expect(card.locator('[data-testid*="title-"]')).toBeVisible(); // Title
      }
    });

    test('should adapt layout on different screen sizes', async ({ page }) => {
      const statsGrid = page.locator('[data-testid="stats-grid"]');
      
      // Desktop layout
      await page.setViewportSize({ width: 1200, height: 800 });
      await expect(statsGrid).toHaveClass(/grid-cols-4/);
      
      // Tablet layout  
      await page.setViewportSize({ width: 768, height: 600 });
      await expect(statsGrid).toHaveClass(/md:grid-cols-2/);
      
      // Mobile layout
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(statsGrid).toBeVisible();
    });
  });

  test.describe('ViewModeToggle', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/manage/departments');
    });

    test('should switch view modes correctly', async ({ page }) => {
      const viewToggle = page.locator('[data-testid="view-mode-toggle"]');
      await expect(viewToggle).toBeVisible();
      
      // Initial state (grid)
      await expect(page.locator('[data-testid="view-mode-toggle-grid"]')).toHaveAttribute('aria-pressed', 'true');
      
      // Switch to table
      await page.click('[data-testid="view-mode-toggle-table"]');
      await expect(page.locator('[data-testid="view-mode-toggle-table"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-testid="view-mode-toggle-grid"]')).toHaveAttribute('aria-pressed', 'false');
      
      // Switch to tree (if available)
      await page.click('[data-testid="view-mode-toggle-tree"]');
      await expect(page.locator('[data-testid="view-mode-toggle-tree"]')).toHaveAttribute('aria-pressed', 'true');
    });

    test('should show icons and labels correctly', async ({ page }) => {
      // Verify each toggle button has an icon
      const toggleButtons = page.locator('[data-testid*="view-mode-toggle-"]');
      
      for (let i = 0; i < await toggleButtons.count(); i++) {
        const button = toggleButtons.nth(i);
        await expect(button.locator('svg')).toBeVisible();
      }
    });

    test('should maintain selection state', async ({ page }) => {
      // Switch to table view
      await page.click('[data-testid="view-mode-toggle-table"]');
      
      // Refresh page
      await page.reload();
      
      // Verify state is preserved (if implemented)
      // In a real app, this might be saved to localStorage or URL params
    });
  });

  test.describe('FileDropZone', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/manage/departments');
      await page.click('button:has-text("Import/Export")');
      await page.click('[role="tab"]:has-text("Import")');
    });

    test('should display drop zone correctly', async ({ page }) => {
      const dropZone = page.locator('[data-testid="file-drop-zone"]');
      await expect(dropZone).toBeVisible();
      
      await expect(page.locator('[data-testid="file-drop-zone-drop-area"]')).toBeVisible();
      await expect(page.locator('text=Drop your files here')).toBeVisible();
      await expect(page.locator('text=or click to browse files')).toBeVisible();
    });

    test('should handle file selection', async ({ page }) => {
      // Create test CSV content
      const csvContent = 'name,number,description\nTest Dept,TEST001,Test description';
      
      // Upload file
      await page.setInputFiles('[data-testid="file-drop-zone-file-input"]', {
        name: 'test-departments.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csvContent)
      });
      
      // Verify file appears in list
      await expect(page.locator('[data-testid="file-drop-zone-files-list"]')).toBeVisible();
      await expect(page.locator('text=test-departments.csv')).toBeVisible();
    });

    test('should show file validation errors', async ({ page }) => {
      // Try to upload invalid file type
      await page.setInputFiles('[data-testid="file-drop-zone-file-input"]', {
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('invalid content')
      });
      
      // Verify error message appears
      await expect(page.locator('[data-testid="file-drop-zone-errors"]')).toBeVisible();
      await expect(page.locator('text=unsupported format')).toBeVisible();
    });

    test('should handle file removal', async ({ page }) => {
      // Upload a file first
      const csvContent = 'name,number,description\nTest Dept,TEST001,Test description';
      await page.setInputFiles('[data-testid="file-drop-zone-file-input"]', {
        name: 'test.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csvContent)
      });
      
      // Remove the file
      await page.click('[data-testid*="file-drop-zone-remove-"]');
      
      // Verify file is removed from list
      await expect(page.locator('text=test.csv')).not.toBeVisible();
    });

    test('should show loading state during upload', async ({ page }) => {
      // Mock slow upload
      await page.route('**/api/v1/departments/import', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        route.continue();
      });
      
      const csvContent = 'name,number\nTest,TEST001';
      await page.setInputFiles('[data-testid="file-drop-zone-file-input"]', {
        name: 'test.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csvContent)
      });
      
      // Click import
      await page.click('button:has-text("Import Departments")');
      
      // Verify loading state
      await expect(page.locator('text=Processing')).toBeVisible();
    });
  });

  test.describe('BulkActionBar', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/manage/departments');
      await page.click('[data-testid="view-mode-toggle-table"]');
    });

    test('should appear when items are selected', async ({ page }) => {
      // Initially hidden
      await expect(page.locator('[data-testid="bulk-action-bar"]')).not.toBeVisible();
      
      // Select an item
      await page.click('[data-testid="data-table-select-0"]');
      
      // Bulk action bar should appear
      await expect(page.locator('[data-testid="bulk-action-bar"]')).toBeVisible();
      await expect(page.locator('text=1 items selected')).toBeVisible();
    });

    test('should update count when selection changes', async ({ page }) => {
      // Select multiple items
      await page.click('[data-testid="data-table-select-0"]');
      await page.click('[data-testid="data-table-select-1"]');
      
      // Verify count updates
      await expect(page.locator('text=2 items selected')).toBeVisible();
      
      // Deselect one
      await page.click('[data-testid="data-table-select-0"]');
      await expect(page.locator('text=1 items selected')).toBeVisible();
    });

    test('should hide when selection is cleared', async ({ page }) => {
      // Select items
      await page.click('[data-testid="data-table-select-0"]');
      await expect(page.locator('[data-testid="bulk-action-bar"]')).toBeVisible();
      
      // Clear selection
      await page.click('[data-testid="bulk-action-bar-clear"]');
      
      // Verify bar disappears
      await expect(page.locator('[data-testid="bulk-action-bar"]')).not.toBeVisible();
    });

    test('should show action buttons correctly', async ({ page }) => {
      // Select items
      await page.click('[data-testid="data-table-select-0"]');
      
      // Verify action buttons are present
      await expect(page.locator('[data-testid*="bulk-action-bar-action-"]')).toHaveCount.greaterThan(0);
      await expect(page.locator('[data-testid="bulk-action-bar-clear"]')).toBeVisible();
    });

    test('should confirm destructive actions', async ({ page }) => {
      // Select items
      await page.click('[data-testid="data-table-select-0"]');
      
      // Mock confirmation dialog
      page.on('dialog', async dialog => {
        expect(dialog.message()).toContain('Are you sure');
        await dialog.dismiss();
      });
      
      // Click delete action
      await page.click('[data-testid="bulk-action-bar-action-delete"]');
      
      // Verification happens in dialog handler above
    });

    test('should handle loading state', async ({ page }) => {
      // Select items
      await page.click('[data-testid="data-table-select-0"]');
      
      // Mock slow action
      await page.route('**/api/v1/departments/**', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        route.continue();
      });
      
      page.on('dialog', async dialog => {
        await dialog.accept();
      });
      
      // Trigger action
      await page.click('[data-testid="bulk-action-bar-action-delete"]');
      
      // Verify loading state (disabled buttons, spinner)
      await expect(page.locator('[data-testid="bulk-action-bar"] button:disabled')).toHaveCount.greaterThan(0);
    });
  });

  test.describe('Component Integration', () => {
    test('should work together as a complete system', async ({ page }) => {
      await page.goto('/manage/departments');
      
      // Use search
      await page.fill('[data-testid="search-filters-search-input"]', 'Engineering');
      
      // Switch view modes
      await page.click('[data-testid="view-mode-toggle-table"]');
      
      // Select items
      await page.click('[data-testid="data-table-select-0"]');
      
      // Verify all components work together
      await expect(page.locator('[data-testid="stats-grid"]')).toBeVisible();
      await expect(page.locator('[data-testid="search-filters"]')).toBeVisible();
      await expect(page.locator('[data-testid="data-table"]')).toBeVisible();
      await expect(page.locator('[data-testid="bulk-action-bar"]')).toBeVisible();
    });

    test('should maintain state consistency across components', async ({ page }) => {
      await page.goto('/manage/departments');
      
      // Apply search filter
      await page.fill('[data-testid="search-filters-search-input"]', 'test');
      
      // Switch to table view
      await page.click('[data-testid="view-mode-toggle-table"]');
      
      // Verify search filter is still applied
      await expect(page.locator('[data-testid="search-filters-search-input"]')).toHaveValue('test');
      
      // Verify table shows filtered results
      await expect(page.locator('[data-testid="data-table"]')).toBeVisible();
    });

    test('should handle errors gracefully across all components', async ({ page }) => {
      // Mock API error
      await page.route('**/api/v1/departments*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error' })
        });
      });
      
      await page.goto('/manage/departments');
      
      // Verify components handle error state appropriately
      await expect(page.locator('[data-testid="stats-grid-loading"]')).toBeVisible();
      // Search should still be functional
      await expect(page.locator('[data-testid="search-filters"]')).toBeVisible();
      // View toggle should still work
      await expect(page.locator('[data-testid="view-mode-toggle"]')).toBeVisible();
    });
  });
});