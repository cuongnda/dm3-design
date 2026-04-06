import { Page, Locator, expect } from '@playwright/test';
import { TestDepartment, TestUser, TestDataFactory } from './test-data';

export class DepartmentManagementPage {
  readonly page: Page;
  
  // Main page elements
  readonly pageTitle: Locator;
  readonly createButton: Locator;
  readonly importExportButton: Locator;
  readonly searchInput: Locator;
  readonly advancedFiltersToggle: Locator;
  readonly statsGrid: Locator;
  readonly viewModeToggle: Locator;
  
  // View mode buttons
  readonly gridViewButton: Locator;
  readonly tableViewButton: Locator;
  readonly treeViewButton: Locator;
  
  // Data containers
  readonly departmentGrid: Locator;
  readonly dataTable: Locator;
  readonly bulkActionBar: Locator;
  readonly pagination: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Main elements
    this.pageTitle = page.locator('h1:has-text("Department Management")');
    this.createButton = page.locator('button:has-text("Create Department")');
    this.importExportButton = page.locator('button:has-text("Import/Export")');
    this.searchInput = page.locator('[data-testid="search-filters-search-input"]');
    this.advancedFiltersToggle = page.locator('[data-testid="search-filters-advanced-toggle"]');
    this.statsGrid = page.locator('[data-testid="stats-grid"]');
    this.viewModeToggle = page.locator('[data-testid="view-mode-toggle"]');
    
    // View mode buttons
    this.gridViewButton = page.locator('[data-testid="view-mode-toggle-grid"]');
    this.tableViewButton = page.locator('[data-testid="view-mode-toggle-table"]');
    this.treeViewButton = page.locator('[data-testid="view-mode-toggle-tree"]');
    
    // Data containers
    this.departmentGrid = page.locator('[data-testid*="department-card"]');
    this.dataTable = page.locator('[data-testid="data-table"]');
    this.bulkActionBar = page.locator('[data-testid="bulk-action-bar"]');
    this.pagination = page.locator('[data-testid="data-table-pagination"]');
  }

  async goto() {
    await this.page.goto('/manage/departments');
    await this.page.waitForLoadState('networkidle');
  }

  async verifyPageLoaded() {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.createButton).toBeVisible();
    await expect(this.statsGrid).toBeVisible();
  }

  async switchToTableView() {
    await this.tableViewButton.click();
    await expect(this.tableViewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(this.dataTable).toBeVisible();
  }

  async switchToGridView() {
    await this.gridViewButton.click();
    await expect(this.gridViewButton).toHaveAttribute('aria-pressed', 'true');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(300); // Debounce
  }

  async openAdvancedFilters() {
    await this.advancedFiltersToggle.click();
  }

  async selectFilter(filterKey: string, value: string) {
    await this.page.click(`[data-testid="search-filters-filter-${filterKey}"]`);
    await this.page.click(`[data-testid="search-filters-filter-${filterKey}-${value}"]`);
  }

  async resetFilters() {
    await this.page.click('[data-testid="search-filters-reset"]');
  }

  async selectDepartmentInTable(index: number) {
    await this.page.click(`[data-testid="data-table-select-${index}"]`);
  }

  async selectAllDepartments() {
    await this.page.click('[data-testid="data-table-select-all"]');
  }

  async clearSelection() {
    await this.page.click('[data-testid="bulk-action-bar-clear"]');
  }

  async verifyBulkActionBar(expectedCount: number) {
    await expect(this.bulkActionBar).toBeVisible();
    await expect(this.page.locator(`text=${expectedCount} items selected`)).toBeVisible();
  }

  async verifyNoBulkActionBar() {
    await expect(this.bulkActionBar).not.toBeVisible();
  }

  async goToNextPage() {
    await this.page.click('[data-testid="data-table-next-page"]');
  }

  async goToPage(page: number) {
    await this.page.click(`[data-testid="data-table-page-${page}"]`);
  }

  async verifyStatsCard(cardId: string, expectedValue: string | number) {
    await expect(this.page.locator(`[data-testid="stats-grid-value-${cardId}"]`)).toContainText(expectedValue.toString());
  }

  async mockDepartmentsAPI(departments: TestDepartment[], page = 1, limit = 20) {
    const response = TestDataFactory.createDepartmentAPIResponse(departments, page, limit);
    
    await this.page.route('**/api/v1/departments*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response)
      });
    });
  }

  async mockEmptyDepartments() {
    await this.page.route('**/api/v1/departments*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          departments: [],
          pagination: { page: 1, limit: 20, total: 0, total_pages: 0 }
        })
      });
    });
  }

  async mockAPIError(status = 500, message = 'Server error') {
    await this.page.route('**/api/v1/departments*', (route) => {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: message })
      });
    });
  }
}

export class DepartmentModal {
  readonly page: Page;
  readonly modal: Locator;
  readonly nameInput: Locator;
  readonly numberInput: Locator;
  readonly descriptionInput: Locator;
  readonly parentSelect: Locator;
  readonly managerSelect: Locator;
  readonly statusSelect: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.locator('[role="dialog"]');
    this.nameInput = page.locator('[data-testid="department-form-name"]');
    this.numberInput = page.locator('[data-testid="department-form-number"]');
    this.descriptionInput = page.locator('[data-testid="department-form-description"]');
    this.parentSelect = page.locator('[data-testid="department-form-parent"]');
    this.managerSelect = page.locator('[data-testid="department-form-manager"]');
    this.statusSelect = page.locator('[data-testid="department-form-status"]');
    this.submitButton = page.locator('[data-testid="department-form-submit"]');
    this.cancelButton = page.locator('[data-testid="department-form-cancel"]');
  }

  async verifyOpen(title: string) {
    await expect(this.modal).toBeVisible();
    await expect(this.page.locator(`h2:has-text("${title}")`)).toBeVisible();
  }

  async fillForm(department: Partial<TestDepartment>) {
    if (department.name) {
      await this.nameInput.fill(department.name);
    }
    if (department.number) {
      await this.numberInput.fill(department.number);
    }
    if (department.description) {
      await this.descriptionInput.fill(department.description);
    }
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.cancelButton.click();
  }

  async verifyValidationError(message: string) {
    await expect(this.page.locator(`text=${message}`)).toBeVisible();
  }

  async verifyClosed() {
    await expect(this.modal).not.toBeVisible();
  }
}

export class UserAssignmentModal {
  readonly page: Page;
  readonly modal: Locator;
  readonly currentUsersTab: Locator;
  readonly assignUsersTab: Locator;
  readonly searchInput: Locator;
  readonly usersList: Locator;
  readonly assignButton: Locator;
  readonly closeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.locator('[role="dialog"]:has-text("Manage Users")');
    this.currentUsersTab = page.locator('[role="tab"]:has-text("Current Users")');
    this.assignUsersTab = page.locator('[role="tab"]:has-text("Assign Users")');
    this.searchInput = page.locator('[placeholder*="Search users"]');
    this.usersList = page.locator('[data-testid*="user-row"]');
    this.assignButton = page.locator('button:has-text("Assign")');
    this.closeButton = page.locator('button:has-text("Close")');
  }

  async verifyOpen() {
    await expect(this.modal).toBeVisible();
    await expect(this.currentUsersTab).toBeVisible();
    await expect(this.assignUsersTab).toBeVisible();
  }

  async switchToAssignTab() {
    await this.assignUsersTab.click();
  }

  async switchToCurrentTab() {
    await this.currentUsersTab.click();
  }

  async searchUsers(query: string) {
    await this.searchInput.fill(query);
  }

  async selectUser(index: number) {
    await this.page.click(`[data-testid="user-select-${index}"]`);
  }

  async assignSelected() {
    await this.assignButton.click();
  }

  async removeUser(userId: string) {
    await this.page.click(`[data-testid="remove-user-${userId}"]`);
  }

  async close() {
    await this.closeButton.click();
  }

  async verifyClosed() {
    await expect(this.modal).not.toBeVisible();
  }
}

export class ImportExportModal {
  readonly page: Page;
  readonly modal: Locator;
  readonly exportTab: Locator;
  readonly importTab: Locator;
  readonly exportButton: Locator;
  readonly downloadSampleButton: Locator;
  readonly fileInput: Locator;
  readonly importButton: Locator;
  readonly dropZone: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.locator('[role="dialog"]:has-text("Import/Export")');
    this.exportTab = page.locator('[role="tab"]:has-text("Export")');
    this.importTab = page.locator('[role="tab"]:has-text("Import")');
    this.exportButton = page.locator('button:has-text("Export Departments")');
    this.downloadSampleButton = page.locator('button:has-text("Download Sample")');
    this.fileInput = page.locator('[data-testid="file-drop-zone-file-input"]');
    this.importButton = page.locator('button:has-text("Import Departments")');
    this.dropZone = page.locator('[data-testid="file-drop-zone-drop-area"]');
  }

  async verifyOpen() {
    await expect(this.modal).toBeVisible();
    await expect(this.exportTab).toBeVisible();
    await expect(this.importTab).toBeVisible();
  }

  async switchToImport() {
    await this.importTab.click();
  }

  async downloadSample() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.downloadSampleButton.click();
    return await downloadPromise;
  }

  async exportDepartments() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportButton.click();
    return await downloadPromise;
  }

  async uploadFile(fileName: string, content: string, mimeType = 'text/csv') {
    await this.fileInput.setInputFiles({
      name: fileName,
      mimeType,
      buffer: Buffer.from(content)
    });
  }

  async import() {
    await this.importButton.click();
  }

  async verifyImportSuccess() {
    await expect(this.page.locator('text=Successfully imported')).toBeVisible();
  }

  async verifyImportError(message: string) {
    await expect(this.page.locator(`text=${message}`)).toBeVisible();
  }
}

// Test utilities
export class TestUtils {
  static async waitForAPICall(page: Page, url: string, timeout = 5000) {
    await page.waitForResponse(response => response.url().includes(url), { timeout });
  }

  static async waitForToast(page: Page, message: string) {
    await expect(page.locator(`text=${message}`)).toBeVisible();
  }

  static async verifyNoConsoleErrors(page: Page) {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // At the end of test, verify no errors
    return () => {
      expect(errors.length).toBe(0);
    };
  }

  static async measurePageLoad(page: Page, url: string) {
    const startTime = Date.now();
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const endTime = Date.now();
    return endTime - startTime;
  }

  static async takeScreenshotOnFailure(page: Page, testName: string) {
    try {
      await page.screenshot({ 
        path: `test-results/screenshots/${testName}-failure.png`,
        fullPage: true 
      });
    } catch (error) {
      console.warn('Failed to take screenshot:', error);
    }
  }
}