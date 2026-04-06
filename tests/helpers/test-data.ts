// Test data factories and utilities

export interface TestDepartment {
  id: string;
  name: string;
  number: string;
  description?: string;
  manager_name?: string;
  user_count?: number;
  status: 'active' | 'inactive';
  parent_id?: string;
  parent_name?: string;
  created_at: string;
  updated_at: string;
}

export interface TestUser {
  id: string;
  user_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  position?: string;
  department_id?: string;
  department_name?: string;
  status: 'active' | 'inactive' | 'suspended';
}

export class TestDataFactory {
  static createDepartment(overrides: Partial<TestDepartment> = {}): TestDepartment {
    const id = overrides.id || `dept-${Date.now()}`;
    const number = overrides.number || `DEPT${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    return {
      id,
      name: `Department ${number}`,
      number,
      description: `Description for ${number}`,
      manager_name: `Manager ${Math.floor(Math.random() * 100)}`,
      user_count: Math.floor(Math.random() * 50),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
  }

  static createUser(overrides: Partial<TestUser> = {}): TestUser {
    const id = overrides.id || `user-${Date.now()}`;
    const userCode = overrides.user_code || `EMP${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const firstName = overrides.first_name || `FirstName${Math.floor(Math.random() * 100)}`;
    const lastName = overrides.last_name || `LastName${Math.floor(Math.random() * 100)}`;
    
    return {
      id,
      user_code: userCode,
      first_name: firstName,
      last_name: lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`,
      phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
      position: 'Employee',
      status: 'active',
      ...overrides
    };
  }

  static createDepartmentList(count: number, options: Partial<TestDepartment> = {}): TestDepartment[] {
    return Array.from({ length: count }, (_, i) => 
      this.createDepartment({ 
        ...options, 
        id: `dept-${i}`,
        number: `DEPT${i.toString().padStart(3, '0')}`,
        name: `Department ${i}`
      })
    );
  }

  static createUserList(count: number, options: Partial<TestUser> = {}): TestUser[] {
    return Array.from({ length: count }, (_, i) => 
      this.createUser({ 
        ...options, 
        id: `user-${i}`,
        user_code: `EMP${i.toString().padStart(3, '0')}`,
        first_name: `User${i}`,
        last_name: 'Test'
      })
    );
  }

  static createHierarchicalDepartments(): TestDepartment[] {
    const rootDept = this.createDepartment({
      id: 'root-dept',
      name: 'Engineering',
      number: 'ENG001',
      parent_id: undefined,
      parent_name: undefined
    });

    const childDept1 = this.createDepartment({
      id: 'child-dept-1',
      name: 'Frontend Team',
      number: 'ENG001-FE',
      parent_id: 'root-dept',
      parent_name: 'Engineering'
    });

    const childDept2 = this.createDepartment({
      id: 'child-dept-2', 
      name: 'Backend Team',
      number: 'ENG001-BE',
      parent_id: 'root-dept',
      parent_name: 'Engineering'
    });

    return [rootDept, childDept1, childDept2];
  }

  static createCSVData(departments: TestDepartment[]): string {
    const header = 'name,number,description,manager_email,parent_number,status';
    const rows = departments.map(dept => 
      `"${dept.name}","${dept.number}","${dept.description || ''}","manager@company.com","${dept.parent_name || ''}","${dept.status}"`
    );
    
    return [header, ...rows].join('\n');
  }

  static createAPIResponse<T>(data: T[], page = 1, limit = 20, total?: number): {
    data: T[];
    page: number;
    limit: number; 
    total: number;
    total_pages: number;
  } {
    const actualTotal = total || data.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    return {
      data: data.slice(startIndex, endIndex),
      page,
      limit,
      total: actualTotal,
      total_pages: Math.ceil(actualTotal / limit)
    };
  }

  static createDepartmentAPIResponse(departments: TestDepartment[], page = 1, limit = 20): any {
    const response = this.createAPIResponse(departments, page, limit);
    return {
      departments: response.data,
      pagination: {
        page: response.page,
        limit: response.limit,
        total: response.total,
        total_pages: response.total_pages
      }
    };
  }
}

// Common test scenarios
export const TestScenarios = {
  // Empty state
  emptyDepartments: {
    departments: [],
    total: 0,
    total_pages: 0
  },

  // Loading state - used with route delays
  loadingDelay: 2000,

  // Error responses
  serverError: {
    status: 500,
    body: { error: 'Internal server error', message: 'Something went wrong' }
  },

  unauthorizedError: {
    status: 401,
    body: { error: 'Unauthorized', message: 'Please login to continue' }
  },

  validationError: {
    status: 400,
    body: { 
      error: 'Validation error', 
      message: 'Invalid input data',
      errors: [
        'Name is required',
        'Number must be unique'
      ]
    }
  },

  // Success responses
  createSuccess: {
    status: 201,
    body: { message: 'Department created successfully' }
  },

  updateSuccess: {
    status: 200,
    body: { message: 'Department updated successfully' }
  },

  deleteSuccess: {
    status: 200,
    body: { message: 'Department deleted successfully' }
  }
};