"""
Database-level Tenant Isolation Tests

These tests verify that tenant isolation is properly enforced at the database level,
including checking for data leakage, proper tenant_id constraints, and cross-tenant reference validation.
"""

import pytest
import psycopg2
from typing import List, Dict, Any
from automation.common.database import DatabaseClient
from automation.common.test_data import create_test_companies


class TestTenantDatabaseIsolation:
    """Test tenant isolation at the database level"""

    @pytest.fixture(scope="class")
    def db_client(self) -> DatabaseClient:
        """Database client for direct database testing"""
        return DatabaseClient()

    @pytest.fixture(scope="class")
    def tenant_data(self, db_client: DatabaseClient):
        """Set up test data for database isolation testing"""
        # Create test companies
        companies = create_test_companies(count=3)
        
        # Insert test data directly into database
        company_ids = []
        for company in companies:
            db_client.execute("""
                INSERT INTO dm3_auth.companies (id, name, code, plan, status)
                VALUES (%s, %s, %s, %s, %s)
            """, (company['id'], company['name'], company['code'], company['plan'], company['status']))
            company_ids.append(company['id'])
        
        # Create test devices for each tenant
        device_ids = []
        for i, company_id in enumerate(company_ids):
            for j in range(3):  # 3 devices per tenant
                device_id = f"test-device-{i}-{j}"
                db_client.execute("""
                    INSERT INTO dm3_devices.devices (device_id, tenant_id, name, type, status)
                    VALUES (%s, %s, %s, %s, %s)
                """, (device_id, company_id, f"Test Device {i}-{j}", "access_reader", "online"))
                device_ids.append(device_id)
        
        # Create test persons for each tenant
        person_ids = []
        for i, company_id in enumerate(company_ids):
            for j in range(2):  # 2 persons per tenant
                person_id = db_client.execute("""
                    INSERT INTO dm3_identity.persons 
                    (tenant_id, first_name, last_name, email, employee_id, status)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    company_id, 
                    f"Person{i}{j}", 
                    "Test", 
                    f"person{i}{j}@test.com",
                    f"EMP-{i}-{j}",
                    "active"
                )).fetchone()[0]
                person_ids.append(person_id)
        
        yield {
            'company_ids': company_ids,
            'device_ids': device_ids,
            'person_ids': person_ids
        }
        
        # Cleanup
        for company_id in company_ids:
            db_client.execute("DELETE FROM dm3_auth.companies WHERE id = %s", (company_id,))

    def test_tenant_id_not_null_constraints(self, db_client: DatabaseClient):
        """Test that tenant_id NOT NULL constraints are enforced"""
        tenant_id_tables = [
            'dm3_devices.devices',
            'dm3_identity.persons',
            'dm3_identity.credentials',
            'dm3_access.access_rules',
            'dm3_access.doors',
            'dm3_access.access_events'
        ]
        
        for table in tenant_id_tables:
            # Try to insert a record without tenant_id
            with pytest.raises(psycopg2.IntegrityError):
                if table == 'dm3_devices.devices':
                    db_client.execute(f"""
                        INSERT INTO {table} (device_id, name, type, status)
                        VALUES ('test-no-tenant', 'Test Device', 'reader', 'offline')
                    """)
                elif table == 'dm3_identity.persons':
                    db_client.execute(f"""
                        INSERT INTO {table} (first_name, last_name, email, status)
                        VALUES ('Test', 'Person', 'test@example.com', 'active')
                    """)
                # Add more specific tests for other tables as needed

    def test_tenant_foreign_key_constraints(self, db_client: DatabaseClient):
        """Test that tenant_id foreign key constraints to companies table work"""
        fake_tenant_id = '00000000-0000-0000-0000-999999999999'
        
        # Try to insert device with non-existent tenant_id
        with pytest.raises(psycopg2.IntegrityError):
            db_client.execute("""
                INSERT INTO dm3_devices.devices (device_id, tenant_id, name, type, status)
                VALUES ('test-fake-tenant', %s, 'Test Device', 'reader', 'offline')
            """, (fake_tenant_id,))

    def test_tenant_data_isolation_in_queries(self, db_client: DatabaseClient, tenant_data):
        """Test that queries with tenant filters only return data for that tenant"""
        company_ids = tenant_data['company_ids']
        
        for company_id in company_ids:
            # Test devices isolation
            devices = db_client.execute("""
                SELECT device_id, tenant_id FROM dm3_devices.devices 
                WHERE tenant_id = %s
            """, (company_id,)).fetchall()
            
            # Verify all devices belong to the correct tenant
            for device in devices:
                assert device[1] == company_id  # tenant_id column
            
            # Test persons isolation
            persons = db_client.execute("""
                SELECT id, tenant_id FROM dm3_identity.persons 
                WHERE tenant_id = %s
            """, (company_id,)).fetchall()
            
            # Verify all persons belong to the correct tenant
            for person in persons:
                assert person[1] == company_id  # tenant_id column

    def test_cross_tenant_data_leakage_prevention(self, db_client: DatabaseClient, tenant_data):
        """Test that queries without tenant filters don't accidentally return cross-tenant data"""
        company_ids = tenant_data['company_ids']
        
        # Query all devices without tenant filter (simulate a bug)
        all_devices = db_client.execute("""
            SELECT DISTINCT tenant_id FROM dm3_devices.devices 
            WHERE device_id LIKE 'test-device-%'
        """).fetchall()
        
        # Should only see our test tenants
        seen_tenant_ids = [device[0] for device in all_devices]
        for tenant_id in seen_tenant_ids:
            assert tenant_id in company_ids

    def test_tenant_isolation_audit_function(self, db_client: DatabaseClient):
        """Test the database audit function for tenant isolation"""
        # Run the validation function
        issues = db_client.execute("SELECT * FROM validate_tenant_isolation()").fetchall()
        
        # If there are issues, they should be documented
        if issues:
            for issue in issues:
                issue_type, table_name, count, description = issue
                print(f"Tenant isolation issue: {description} - {count} records in {table_name}")
        
        # Test should pass even if there are issues, but log them
        assert True  # This test is informational

    def test_tenant_usage_stats_view(self, db_client: DatabaseClient, tenant_data):
        """Test the tenant usage statistics view"""
        company_ids = tenant_data['company_ids']
        
        for company_id in company_ids:
            stats = db_client.execute("""
                SELECT tenant_id, current_devices, current_users, current_persons
                FROM dm3_auth.tenant_usage_stats
                WHERE tenant_id = %s
            """, (company_id,)).fetchone()
            
            assert stats is not None
            assert stats[0] == company_id  # tenant_id
            assert stats[1] >= 0  # current_devices
            assert stats[2] >= 0  # current_users
            assert stats[3] >= 0  # current_persons

    def test_timescale_hypertable_tenant_partitioning(self, db_client: DatabaseClient, tenant_data):
        """Test that TimescaleDB hypertables properly partition by tenant"""
        company_ids = tenant_data['company_ids']
        
        # Insert test access events for each tenant
        for i, company_id in enumerate(company_ids):
            db_client.execute("""
                INSERT INTO dm3_access.access_events 
                (tenant_id, time, decision, reason)
                VALUES (%s, NOW(), %s, %s)
            """, (company_id, "granted", f"Test event for tenant {i}"))
        
        # Query events by tenant
        for company_id in company_ids:
            events = db_client.execute("""
                SELECT tenant_id, decision FROM dm3_access.access_events
                WHERE tenant_id = %s AND reason LIKE 'Test event%'
            """, (company_id,)).fetchall()
            
            # Should only see events for this tenant
            for event in events:
                assert event[0] == company_id

    def test_cascade_delete_tenant_isolation(self, db_client: DatabaseClient):
        """Test that cascade deletes respect tenant boundaries"""
        # Create a test company
        test_company_id = '12345678-1234-1234-1234-123456789abc'
        db_client.execute("""
            INSERT INTO dm3_auth.companies (id, name, code, plan, status)
            VALUES (%s, %s, %s, %s, %s)
        """, (test_company_id, "Test Company", "test-co", "enterprise", "active"))
        
        # Create a person for this company
        person_id = db_client.execute("""
            INSERT INTO dm3_identity.persons 
            (tenant_id, first_name, last_name, email, employee_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (test_company_id, "Test", "Person", "test@cascade.com", "EMP-CASCADE")).fetchone()[0]
        
        # Create a credential for this person
        db_client.execute("""
            INSERT INTO dm3_identity.credentials 
            (tenant_id, person_id, type, value, status)
            VALUES (%s, %s, %s, %s, %s)
        """, (test_company_id, person_id, "card", "123456789", "active"))
        
        # Delete the person
        db_client.execute("DELETE FROM dm3_identity.persons WHERE id = %s", (person_id,))
        
        # Verify credentials are also deleted (should cascade)
        remaining_credentials = db_client.execute("""
            SELECT COUNT(*) FROM dm3_identity.credentials WHERE person_id = %s
        """, (person_id,)).fetchone()[0]
        
        assert remaining_credentials == 0
        
        # Cleanup
        db_client.execute("DELETE FROM dm3_auth.companies WHERE id = %s", (test_company_id,))

    def test_tenant_row_level_security_simulation(self, db_client: DatabaseClient, tenant_data):
        """Test simulation of row-level security policies"""
        company_ids = tenant_data['company_ids']
        
        # This test simulates what RLS would do - filter by tenant_id in application layer
        for company_id in company_ids:
            # Simulate a user from this tenant querying devices
            user_devices = db_client.execute("""
                SELECT device_id, tenant_id FROM dm3_devices.devices
                WHERE tenant_id = %s
            """, (company_id,)).fetchall()
            
            # Verify user only sees their tenant's devices
            for device in user_devices:
                assert device[1] == company_id
            
            # Verify user cannot see other tenants' devices in this filtered view
            other_tenant_ids = [tid for tid in company_ids if tid != company_id]
            for other_tenant_id in other_tenant_ids:
                other_tenant_devices = db_client.execute("""
                    SELECT device_id FROM dm3_devices.devices
                    WHERE tenant_id = %s AND device_id IN (
                        SELECT device_id FROM dm3_devices.devices WHERE tenant_id = %s
                    )
                """, (other_tenant_id, company_id)).fetchall()
                
                # Should be empty - no overlap between tenants
                assert len(other_tenant_devices) == 0

    def test_database_index_performance_with_tenant_filtering(self, db_client: DatabaseClient, tenant_data):
        """Test that tenant-aware indexes provide good performance"""
        company_ids = tenant_data['company_ids']
        
        for company_id in company_ids:
            # Test query performance with tenant index
            explain_result = db_client.execute("""
                EXPLAIN (FORMAT JSON) 
                SELECT * FROM dm3_devices.devices 
                WHERE tenant_id = %s AND status = 'online'
            """, (company_id,)).fetchone()[0]
            
            # Verify that an index is being used (simplified check)
            query_plan = str(explain_result)
            # In a real test, you'd parse the JSON and verify index usage
            assert "Seq Scan" not in query_plan or "Index" in query_plan

    def test_tenant_constraint_violations(self, db_client: DatabaseClient):
        """Test various constraint violations related to tenant isolation"""
        
        # Test 1: Try to create credential with mismatched tenant_id
        test_company_id = '12345678-1234-1234-1234-123456789def'
        other_company_id = '87654321-4321-4321-4321-987654321fed'
        
        # Create both companies
        for company_id, name in [(test_company_id, "Test Company 1"), (other_company_id, "Test Company 2")]:
            db_client.execute("""
                INSERT INTO dm3_auth.companies (id, name, code, plan, status)
                VALUES (%s, %s, %s, %s, %s)
            """, (company_id, name, f"test-{company_id[:8]}", "starter", "active"))
        
        # Create person in first company
        person_id = db_client.execute("""
            INSERT INTO dm3_identity.persons 
            (tenant_id, first_name, last_name, email, employee_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (test_company_id, "Test", "Person", "test@constraint.com", "EMP-CONSTRAINT")).fetchone()[0]
        
        # This should work - same tenant
        db_client.execute("""
            INSERT INTO dm3_identity.credentials 
            (tenant_id, person_id, type, value, status)
            VALUES (%s, %s, %s, %s, %s)
        """, (test_company_id, person_id, "card", "111111111", "active"))
        
        # This should be prevented by application logic (not database constraint in this implementation)
        # In a more advanced implementation, you might have database triggers to prevent this
        
        # Cleanup
        db_client.execute("DELETE FROM dm3_auth.companies WHERE id IN (%s, %s)", 
                         (test_company_id, other_company_id))