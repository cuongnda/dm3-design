"""
Tenant Security Tests

These tests verify security aspects of tenant isolation including:
- JWT token manipulation attempts
- Authorization bypass attempts  
- Data exfiltration prevention
- Privilege escalation prevention
"""

import pytest
import jwt
import requests
from typing import Dict, Any, Optional
from automation.common.api_client import ApiClient
from automation.common.test_data import create_test_companies, create_test_users


class TestTenantSecurity:
    """Test security aspects of tenant isolation"""

    @pytest.fixture(scope="class")
    def security_test_setup(self, api_client: ApiClient):
        """Set up test environment for security testing"""
        # Create two companies for cross-tenant testing
        companies = create_test_companies(count=2)
        users = {}
        
        for i, company in enumerate(companies):
            company_users = create_test_users(
                company_id=company['id'],
                count=3,
                roles=['primary_manager', 'manager', 'operator']
            )
            users[company['id']] = company_users
        
        yield {
            'companies': companies,
            'users': users
        }
        
        # Cleanup
        for company in companies:
            api_client.cleanup_company(company['id'])

    def create_malicious_token(self, 
                              original_token: str, 
                              secret: str,
                              modifications: Dict[str, Any]) -> str:
        """Create a malicious JWT token with modified claims"""
        try:
            # Decode the original token
            payload = jwt.decode(original_token, secret, algorithms=["HS256"])
            
            # Apply modifications
            for key, value in modifications.items():
                payload[key] = value
            
            # Re-encode with the same secret
            return jwt.encode(payload, secret, algorithm="HS256")
        except Exception:
            # Return invalid token if manipulation fails
            return "invalid.jwt.token"

    def test_jwt_tenant_id_manipulation(self, api_client: ApiClient, security_test_setup):
        """Test that manipulating tenant_id in JWT token is rejected"""
        companies = security_test_setup['companies']
        users = security_test_setup['users']
        
        company_a = companies[0]
        company_b = companies[1]
        user_a = users[company_a['id']][0]
        
        # Get legitimate token for user A
        token_a = api_client.login(user_a['email'], company_id=company_a['id'])
        
        # Try to manipulate the token to access company B's data
        malicious_token = self.create_malicious_token(
            token_a, 
            api_client.jwt_secret,
            modifications={
                'cid': company_b['id'],  # Change company_id
                'tid': company_b['id']   # Change tenant_id
            }
        )
        
        headers = {'Authorization': f'Bearer {malicious_token}'}
        
        # Try to access devices with manipulated token
        response = api_client.get('/api/v1/devices', headers=headers)
        
        # Should be rejected due to token validation
        assert response.status_code in [401, 403]

    def test_role_escalation_via_jwt_manipulation(self, api_client: ApiClient, security_test_setup):
        """Test that escalating role in JWT token is rejected"""
        companies = security_test_setup['companies']
        users = security_test_setup['users']
        
        company = companies[0]
        operator_user = None
        
        # Find an operator user
        for user in users[company['id']]:
            if user['role'] == 'operator':
                operator_user = user
                break
        
        if not operator_user:
            pytest.skip("No operator user found for role escalation test")
        
        # Get legitimate token for operator
        token = api_client.login(operator_user['email'], company_id=company['id'])
        
        # Try to escalate to system_admin role
        malicious_token = self.create_malicious_token(
            token,
            api_client.jwt_secret,
            modifications={
                'role': 'system_admin',
                'roles': ['system_admin']
            }
        )
        
        headers = {'Authorization': f'Bearer {malicious_token}'}
        
        # Try to access admin endpoints
        response = api_client.get('/api/v1/admin/tenants', headers=headers)
        
        # Should be rejected
        assert response.status_code in [401, 403]

    def test_cross_tenant_access_via_query_parameter(self, api_client: ApiClient, security_test_setup):
        """Test that non-admin users cannot use company_id query parameter"""
        companies = security_test_setup['companies']
        users = security_test_setup['users']
        
        company_a = companies[0]
        company_b = companies[1]
        user_a = users[company_a['id']][0]
        
        # Login as regular user from company A
        token = api_client.login(user_a['email'], company_id=company_a['id'])
        headers = {'Authorization': f'Bearer {token}'}
        
        # Try to access company B's data using query parameter
        response = api_client.get(
            f'/api/v1/devices?company_id={company_b["id"]}',
            headers=headers
        )
        
        # Should either ignore the parameter or reject the request
        assert response.status_code in [200, 403]
        
        if response.status_code == 200:
            devices = response.json()['devices']
            # Should only see devices from user's own tenant (company A)
            for device in devices:
                assert device['tenant_id'] == company_a['id']

    def test_sql_injection_in_tenant_context(self, api_client: ApiClient, security_test_setup):
        """Test that SQL injection attempts in tenant context are prevented"""
        companies = security_test_setup['companies']
        users = security_test_setup['users']
        
        company = companies[0]
        user = users[company['id']][0]
        
        token = api_client.login(user['email'], company_id=company['id'])
        headers = {'Authorization': f'Bearer {token}'}
        
        # SQL injection attempts in search parameters
        malicious_searches = [
            "'; DROP TABLE dm3_devices.devices; --",
            "' OR '1'='1",
            "' UNION SELECT * FROM dm3_auth.companies --",
            "'; UPDATE dm3_identity.persons SET tenant_id='00000000-0000-0000-0000-000000000000'; --"
        ]
        
        for malicious_search in malicious_searches:
            response = api_client.get(
                f'/api/v1/devices?search={malicious_search}',
                headers=headers
            )
            
            # Should not cause server error and should sanitize input
            assert response.status_code in [200, 400]
            
            if response.status_code == 200:
                # Verify normal response structure
                data = response.json()
                assert 'devices' in data

    def test_unauthorized_tenant_switching(self, api_client: ApiClient, security_test_setup):
        """Test that users cannot switch tenants without proper authentication"""
        companies = security_test_setup['companies']
        users = security_test_setup['users']
        
        company_a = companies[0]
        company_b = companies[1]
        user_a = users[company_a['id']][0]
        
        # Login to company A
        token_a = api_client.login(user_a['email'], company_id=company_a['id'])
        
        # Try to use the same credentials to access company B
        login_data = {
            'email': user_a['email'],
            'password': 'password123',  # Assuming test password
            'company_id': company_b['id']
        }
        
        response = api_client.post('/api/v1/auth/login', json=login_data)
        
        # Should fail because user doesn't belong to company B
        assert response.status_code in [401, 403, 404]

    def test_tenant_data_enumeration_prevention(self, api_client: ApiClient, security_test_setup):
        """Test that tenant data cannot be enumerated through ID guessing"""
        companies = security_test_setup['companies']
        users = security_test_setup['users']
        
        company_a = companies[0]
        company_b = companies[1]
        user_a = users[company_a['id']][0]
        
        token = api_client.login(user_a['email'], company_id=company_a['id'])
        headers = {'Authorization': f'Bearer {token}'}
        
        # Try to enumerate devices by guessing UUIDs
        fake_device_ids = [
            '00000000-0000-0000-0000-000000000001',
            '11111111-1111-1111-1111-111111111111',
            'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
        ]
        
        for fake_id in fake_device_ids:
            response = api_client.get(f'/api/v1/devices/{fake_id}', headers=headers)
            
            # Should return 404 (not found) not 403 (forbidden)
            # This prevents information leakage about existence of resources
            assert response.status_code == 404

    def test_session_hijacking_prevention(self, api_client: ApiClient, security_test_setup):
        """Test that session tokens are properly validated"""
        companies = security_test_setup['companies']
        users = security_test_setup['users']
        
        company = companies[0]
        user = users[company['id']][0]
        
        # Get legitimate token
        token = api_client.login(user['email'], company_id=company['id'])
        
        # Test various token manipulation attempts
        invalid_tokens = [
            token[:-10] + "0123456789",  # Modified signature
            token + "extra",             # Appended data
            token[10:],                  # Truncated token
            "Bearer " + token,           # Double Bearer prefix
            "",                          # Empty token
            "invalid.token.here"         # Completely invalid token
        ]
        
        for invalid_token in invalid_tokens:
            headers = {'Authorization': f'Bearer {invalid_token}'}
            response = api_client.get('/api/v1/tenant/current', headers=headers)
            assert response.status_code == 401

    def test_information_disclosure_prevention(self, api_client: ApiClient, security_test_setup):
        """Test that error messages don't disclose sensitive information"""
        companies = security_test_setup['companies']
        users = security_test_setup['users']
        
        company = companies[0]
        user = users[company['id']][0]
        
        token = api_client.login(user['email'], company_id=company['id'])
        headers = {'Authorization': f'Bearer {token}'}
        
        # Test accessing non-existent resources
        response = api_client.get('/api/v1/devices/00000000-0000-0000-0000-000000000001', headers=headers)
        assert response.status_code == 404
        
        error_message = response.json().get('error', '').lower()
        
        # Error message should not reveal tenant information
        sensitive_terms = ['tenant', 'company', 'isolation', 'access denied', 'different tenant']
        for term in sensitive_terms:
            assert term not in error_message

    def test_concurrent_session_security(self, api_client: ApiClient, security_test_setup):
        """Test security with concurrent sessions from different tenants"""
        companies = security_test_setup['companies']
        users = security_test_setup['users']
        
        company_a = companies[0]
        company_b = companies[1]
        user_a = users[company_a['id']][0]
        user_b = users[company_b['id']][0]
        
        # Create concurrent sessions
        token_a = api_client.login(user_a['email'], company_id=company_a['id'])
        token_b = api_client.login(user_b['email'], company_id=company_b['id'])
        
        headers_a = {'Authorization': f'Bearer {token_a}'}
        headers_b = {'Authorization': f'Bearer {token_b}'}
        
        # Make concurrent requests
        import threading
        results = {}
        
        def make_request(user_id, headers):
            response = api_client.get('/api/v1/devices', headers=headers)
            results[user_id] = response
        
        # Start concurrent threads
        thread_a = threading.Thread(target=make_request, args=('a', headers_a))
        thread_b = threading.Thread(target=make_request, args=('b', headers_b))
        
        thread_a.start()
        thread_b.start()
        
        thread_a.join()
        thread_b.join()
        
        # Verify both requests succeeded with proper isolation
        assert results['a'].status_code == 200
        assert results['b'].status_code == 200
        
        devices_a = results['a'].json()['devices']
        devices_b = results['b'].json()['devices']
        
        # Verify no cross-contamination
        for device in devices_a:
            assert device['tenant_id'] == company_a['id']
        
        for device in devices_b:
            assert device['tenant_id'] == company_b['id']

    def test_audit_log_tenant_isolation(self, api_client: ApiClient, security_test_setup):
        """Test that audit logs properly isolate tenant activities"""
        # This test assumes audit logging is implemented
        companies = security_test_setup['companies']
        users = security_test_setup['users']
        
        company = companies[0]
        user = users[company['id']][0]
        
        token = api_client.login(user['email'], company_id=company['id'])
        headers = {'Authorization': f'Bearer {token}'}
        
        # Perform some auditable actions
        api_client.get('/api/v1/devices', headers=headers)
        api_client.get('/api/v1/persons', headers=headers)
        
        # If audit logs exist, verify they're properly tenant-isolated
        # This would require access to audit log API
        audit_response = api_client.get('/api/v1/audit/logs', headers=headers)
        
        if audit_response.status_code == 200:
            logs = audit_response.json().get('logs', [])
            for log in logs:
                # Verify all audit logs belong to the correct tenant
                if 'tenant_id' in log:
                    assert log['tenant_id'] == company['id']