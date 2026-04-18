"""
Tenant Isolation API Tests

These tests verify that tenant isolation is properly enforced at the API level.
Each tenant should only be able to access their own data.
"""

import pytest
import requests
from typing import Dict, Any
from automation.common.api_client import ApiClient
from automation.common.test_data import create_test_companies, create_test_users, create_test_devices


class TestTenantAPIIsolation:
    """Test tenant isolation enforcement in API endpoints"""

    @pytest.fixture(scope="class")
    def tenant_setup(self, api_client: ApiClient):
        """Set up multiple tenants for isolation testing"""
        # Create test companies (tenants)
        companies = create_test_companies(count=3)
        users = {}
        devices = {}
        
        for i, company in enumerate(companies):
            # Create users for each company
            company_users = create_test_users(
                company_id=company['id'],
                count=2,
                roles=['manager', 'operator']
            )
            users[company['id']] = company_users
            
            # Create devices for each company
            company_devices = create_test_devices(
                tenant_id=company['id'],
                count=3
            )
            devices[company['id']] = company_devices
        
        yield {
            'companies': companies,
            'users': users,
            'devices': devices
        }
        
        # Cleanup after tests
        for company in companies:
            api_client.cleanup_company(company['id'])

    def get_auth_header(self, api_client: ApiClient, user_email: str, company_id: str) -> Dict[str, str]:
        """Get authentication header for a specific user"""
        token = api_client.login(user_email, company_id=company_id)
        return {'Authorization': f'Bearer {token}'}

    def test_device_list_isolation(self, api_client: ApiClient, tenant_setup):
        """Test that users can only see devices from their own tenant"""
        companies = tenant_setup['companies']
        users = tenant_setup['users']
        devices = tenant_setup['devices']
        
        for company in companies:
            company_id = company['id']
            user = users[company_id][0]  # Use first user (manager)
            headers = self.get_auth_header(api_client, user['email'], company_id)
            
            # Fetch devices for this user
            response = api_client.get('/api/v1/devices', headers=headers)
            assert response.status_code == 200
            
            device_list = response.json()['devices']
            expected_device_count = len(devices[company_id])
            
            # Verify device count matches expected
            assert len(device_list) == expected_device_count
            
            # Verify all returned devices belong to this tenant
            for device in device_list:
                assert device['tenant_id'] == company_id
                # Verify device exists in our test data
                assert any(d['id'] == device['id'] for d in devices[company_id])

    def test_person_list_isolation(self, api_client: ApiClient, tenant_setup):
        """Test that users can only see persons from their own tenant"""
        companies = tenant_setup['companies']
        users = tenant_setup['users']
        
        for company in companies:
            company_id = company['id']
            user = users[company_id][0]
            headers = self.get_auth_header(api_client, user['email'], company_id)
            
            response = api_client.get('/api/v1/persons', headers=headers)
            assert response.status_code == 200
            
            person_list = response.json()['persons']
            
            # Verify all returned persons belong to this tenant
            for person in person_list:
                assert person['tenant_id'] == company_id

    def test_cross_tenant_device_access_denied(self, api_client: ApiClient, tenant_setup):
        """Test that users cannot access devices from other tenants"""
        companies = tenant_setup['companies']
        users = tenant_setup['users']
        devices = tenant_setup['devices']
        
        company_a = companies[0]
        company_b = companies[1]
        
        user_a = users[company_a['id']][0]
        device_b = devices[company_b['id']][0]  # Device from different tenant
        
        headers = self.get_auth_header(api_client, user_a['email'], company_a['id'])
        
        # Try to access device from different tenant
        response = api_client.get(f'/api/v1/devices/{device_b["id"]}', headers=headers)
        
        # Should be 404 (not found) or 403 (forbidden)
        assert response.status_code in [403, 404]

    def test_cross_tenant_person_access_denied(self, api_client: ApiClient, tenant_setup):
        """Test that users cannot access persons from other tenants"""
        companies = tenant_setup['companies']
        users = tenant_setup['users']
        
        company_a = companies[0]
        company_b = companies[1]
        
        user_a = users[company_a['id']][0]
        user_b = users[company_b['id']][0]  # Person from different tenant
        
        headers = self.get_auth_header(api_client, user_a['email'], company_a['id'])
        
        # Try to access person from different tenant
        response = api_client.get(f'/api/v1/persons/{user_b["person_id"]}', headers=headers)
        
        assert response.status_code in [403, 404]

    def test_device_creation_auto_assigns_tenant(self, api_client: ApiClient, tenant_setup):
        """Test that new devices are automatically assigned to the user's tenant"""
        companies = tenant_setup['companies']
        users = tenant_setup['users']
        
        company = companies[0]
        user = users[company['id']][0]
        headers = self.get_auth_header(api_client, user['email'], company['id'])
        
        device_data = {
            'device_id': 'test-device-isolation',
            'name': 'Test Device for Isolation',
            'type': 'access_reader',
            'location': 'Test Location'
        }
        
        response = api_client.post('/api/v1/devices', json=device_data, headers=headers)
        assert response.status_code == 201
        
        created_device = response.json()['device']
        
        # Verify tenant_id is automatically set to user's tenant
        assert created_device['tenant_id'] == company['id']
        
        # Cleanup
        api_client.delete(f'/api/v1/devices/{created_device["id"]}', headers=headers)

    def test_person_creation_auto_assigns_tenant(self, api_client: ApiClient, tenant_setup):
        """Test that new persons are automatically assigned to the user's tenant"""
        companies = tenant_setup['companies']
        users = tenant_setup['users']
        
        company = companies[0]
        user = users[company['id']][0]
        headers = self.get_auth_header(api_client, user['email'], company['id'])
        
        person_data = {
            'first_name': 'Test',
            'last_name': 'Person',
            'email': 'test.person@example.com',
            'employee_id': 'EMP-TEST-001'
        }
        
        response = api_client.post('/api/v1/persons', json=person_data, headers=headers)
        assert response.status_code == 201
        
        created_person = response.json()['person']
        
        # Verify tenant_id is automatically set to user's tenant
        assert created_person['tenant_id'] == company['id']
        
        # Cleanup
        api_client.delete(f'/api/v1/persons/{created_person["id"]}', headers=headers)

    def test_access_rule_isolation(self, api_client: ApiClient, tenant_setup):
        """Test that access rules are properly isolated by tenant"""
        companies = tenant_setup['companies']
        users = tenant_setup['users']
        
        for company in companies:
            company_id = company['id']
            user = users[company_id][0]
            headers = self.get_auth_header(api_client, user['email'], company_id)
            
            response = api_client.get('/api/v1/access-rules', headers=headers)
            assert response.status_code == 200
            
            rules = response.json()['rules']
            
            # Verify all rules belong to this tenant
            for rule in rules:
                assert rule['tenant_id'] == company_id

    def test_system_admin_cross_tenant_access(self, api_client: ApiClient, tenant_setup):
        """Test that system admins can access data from multiple tenants when scoped"""
        companies = tenant_setup['companies']
        
        # Use system admin credentials
        admin_headers = api_client.get_system_admin_headers()
        
        for company in companies:
            company_id = company['id']
            
            # System admin should be able to access any tenant's data when scoped
            response = api_client.get(
                f'/api/v1/devices?company_id={company_id}',
                headers=admin_headers
            )
            assert response.status_code == 200
            
            devices = response.json()['devices']
            
            # Verify all devices belong to the scoped tenant
            for device in devices:
                assert device['tenant_id'] == company_id

    def test_tenant_usage_stats_isolation(self, api_client: ApiClient, tenant_setup):
        """Test that tenant usage stats only show data for the current tenant"""
        companies = tenant_setup['companies']
        users = tenant_setup['users']
        devices = tenant_setup['devices']
        
        for company in companies:
            company_id = company['id']
            user = users[company_id][0]
            headers = self.get_auth_header(api_client, user['email'], company_id)
            
            response = api_client.get('/api/v1/tenant/stats', headers=headers)
            assert response.status_code == 200
            
            stats = response.json()
            
            # Verify stats are for the correct tenant
            assert stats['tenant_id'] == company_id
            
            # Verify device count matches what we created
            expected_device_count = len(devices[company_id])
            assert stats['usage']['devices']['current'] >= expected_device_count

    def test_unauthorized_access_without_token(self, api_client: ApiClient, tenant_setup):
        """Test that all tenant-scoped endpoints require authentication"""
        endpoints = [
            '/api/v1/devices',
            '/api/v1/persons',
            '/api/v1/access-rules',
            '/api/v1/tenant/current',
            '/api/v1/tenant/stats'
        ]
        
        for endpoint in endpoints:
            response = api_client.get(endpoint)  # No auth headers
            assert response.status_code == 401

    def test_malformed_tenant_id_rejected(self, api_client: ApiClient, tenant_setup):
        """Test that malformed tenant IDs are properly rejected"""
        companies = tenant_setup['companies']
        users = tenant_setup['users']
        
        company = companies[0]
        user = users[company['id']][0]
        
        # Try to login with malformed company_id
        login_data = {
            'email': user['email'],
            'password': 'password123',
            'company_id': 'invalid-uuid-format'
        }
        
        response = api_client.post('/api/v1/auth/login', json=login_data)
        assert response.status_code == 400