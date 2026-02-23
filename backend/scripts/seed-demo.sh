#!/bin/bash
# Seed demo data into DM3 database
set -e

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-dm3}"
DB_PASS="${DB_PASS:-dm3secret}"
DB_NAME="${DB_NAME:-dm3}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATION_FILE="$SCRIPT_DIR/../pkg/db/migrations/008_seed_demo_data.sql"

echo "🌱 Seeding demo data into $DB_NAME..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"
echo "✅ Demo data seeded successfully!"

# Show counts
echo ""
echo "📊 Data summary:"
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 'Persons' as entity, COUNT(*) as count FROM dm3_identity.persons WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'Credentials', COUNT(*) FROM dm3_identity.credentials WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'Person Groups', COUNT(*) FROM dm3_identity.person_groups WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'Access Rules', COUNT(*) FROM dm3_access.access_rules WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
"
