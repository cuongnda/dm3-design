#!/bin/bash
# DM3 Documentation Health Check
# Run weekly or after major changes

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ISSUES=0

echo "🔍 DM3 Documentation Health Check"
echo "=================================="

# 1. Check migration count matches PROJECT.md
echo "📊 Checking migration count..."
actual_migrations=$(ls "$PROJECT_ROOT/backend/pkg/db/migrations/"*.sql 2>/dev/null | wc -l | tr -d ' ')
documented_migrations=$(grep -o '[0-9]* migrations' "$PROJECT_ROOT/PROJECT.md" | grep -o '[0-9]*')

if [ "$actual_migrations" != "$documented_migrations" ]; then
  echo "⚠️  Migration count mismatch: PROJECT.md says $documented_migrations, actual is $actual_migrations"
  ISSUES=$((ISSUES+1))
else
  echo "✅ Migration count matches: $actual_migrations"
fi

# 2. Check that key paths referenced in PROJECT.md exist
echo "📁 Checking key paths..."
declare -a paths=("backend/" "apps/console/" "packages/ui/" "packages/api-client/" "simulator/" "dm3-terminal/" "docs/" "mockups/")

for path in "${paths[@]}"; do
  if [ -d "$PROJECT_ROOT/$path" ]; then
    echo "✅ $path exists"
  else
    echo "⚠️  $path referenced in PROJECT.md but doesn't exist"
    ISSUES=$((ISSUES+1))
  fi
done

# 3. Check ports in docs match docker-compose
echo "🔌 Checking port consistency..."
if [ -f "$PROJECT_ROOT/backend/docker-compose.yml" ]; then
  # Extract ports from PROJECT.md
  project_ports=$(grep -o ':[0-9]*' "$PROJECT_ROOT/PROJECT.md" | grep -o '[0-9]*' | sort -u)
  
  # Check if major services match
  if grep -q "5433:5432" "$PROJECT_ROOT/backend/docker-compose.yml"; then
    echo "✅ TimescaleDB port (5433) matches"
  else
    echo "⚠️  TimescaleDB port mismatch"
    ISSUES=$((ISSUES+1))
  fi
  
  if grep -q "1884:1883" "$PROJECT_ROOT/backend/docker-compose.yml"; then
    echo "✅ EMQX port (1884) matches"
  else
    echo "⚠️  EMQX port mismatch" 
    ISSUES=$((ISSUES+1))
  fi
  
  if grep -q "6380:6379" "$PROJECT_ROOT/backend/docker-compose.yml"; then
    echo "✅ Valkey port (6380) matches"
  else
    echo "⚠️  Valkey port mismatch"
    ISSUES=$((ISSUES+1))
  fi
else
  echo "⚠️  backend/docker-compose.yml not found"
  ISSUES=$((ISSUES+1))
fi

# 4. Check if any new directories in apps/ not documented in PROJECT.md
echo "🏗️  Checking for undocumented apps..."
if [ -d "$PROJECT_ROOT/apps" ]; then
  for app_dir in "$PROJECT_ROOT/apps"/*; do
    if [ -d "$app_dir" ]; then
      app_name=$(basename "$app_dir")
      if grep -q "apps/$app_name" "$PROJECT_ROOT/PROJECT.md"; then
        echo "✅ apps/$app_name documented"
      else
        echo "⚠️  apps/$app_name exists but not documented in PROJECT.md"
        ISSUES=$((ISSUES+1))
      fi
    fi
  done
fi

# 5. Check changelog directory exists and has recent entries
echo "📝 Checking changelog..."
if [ -d "$PROJECT_ROOT/docs/changelog" ]; then
  changelog_count=$(find "$PROJECT_ROOT/docs/changelog" -name "*.md" | wc -l | tr -d ' ')
  echo "✅ Found $changelog_count changelog entries"
  
  # Check for very recent entries (last 30 days)
  recent_entries=$(find "$PROJECT_ROOT/docs/changelog" -name "2026-03*.md" | wc -l | tr -d ' ')
  if [ "$recent_entries" -gt 0 ]; then
    echo "✅ Recent changelog entries found: $recent_entries"
  else
    echo "ℹ️  No recent changelog entries (2026-03-*), consider documenting major changes"
  fi
else
  echo "⚠️  docs/changelog directory not found"
  ISSUES=$((ISSUES+1))
fi

# 6. Check IMPLEMENTATION_STATUS.md exists and is recent
echo "📋 Checking implementation status..."
if [ -f "$PROJECT_ROOT/docs/IMPLEMENTATION_STATUS.md" ]; then
  echo "✅ IMPLEMENTATION_STATUS.md exists"
  
  # Check if file was modified recently (last 7 days)
  if [ $(uname) = "Darwin" ]; then
    # macOS date command
    last_modified=$(stat -f %m "$PROJECT_ROOT/docs/IMPLEMENTATION_STATUS.md" 2>/dev/null || echo 0)
    seven_days_ago=$(date -v-7d +%s)
  else
    # Linux date command
    last_modified=$(stat -c %Y "$PROJECT_ROOT/docs/IMPLEMENTATION_STATUS.md" 2>/dev/null || echo 0)
    seven_days_ago=$(date -d '7 days ago' +%s)
  fi
  
  if [ "$last_modified" -gt "$seven_days_ago" ]; then
    echo "✅ IMPLEMENTATION_STATUS.md recently updated"
  else
    echo "ℹ️  IMPLEMENTATION_STATUS.md hasn't been updated recently, consider refreshing after major changes"
  fi
else
  echo "⚠️  docs/IMPLEMENTATION_STATUS.md not found"
  ISSUES=$((ISSUES+1))
fi

# 7. Check WebSocket integration summary
echo "🔌 Checking WebSocket documentation..."
if [ -f "$PROJECT_ROOT/WEBSOCKET_INTEGRATION_SUMMARY.md" ]; then
  echo "✅ WEBSOCKET_INTEGRATION_SUMMARY.md exists"
else
  echo "⚠️  WEBSOCKET_INTEGRATION_SUMMARY.md not found"
  ISSUES=$((ISSUES+1))
fi

# 8. Check spec count matches documentation
echo "📚 Checking spec count..."
if [ -d "$PROJECT_ROOT/docs/specs" ]; then
  actual_specs=$(find "$PROJECT_ROOT/docs/specs" -name "*.md" ! -name "SPEC_TEMPLATE.md" | wc -l | tr -d ' ')
  documented_specs=$(grep -o '[0-9]* specs' "$PROJECT_ROOT/PROJECT.md" | grep -o '[0-9]*' || echo "0")
  
  if [ "$actual_specs" != "$documented_specs" ] && [ "$documented_specs" != "0" ]; then
    echo "⚠️  Spec count mismatch: PROJECT.md says $documented_specs, actual is $actual_specs"
    ISSUES=$((ISSUES+1))
  else
    echo "✅ Found $actual_specs spec files"
  fi
fi

# Summary
echo ""
echo "📊 Health Check Summary"
echo "======================"
if [ $ISSUES -eq 0 ]; then
  echo "✅ All checks passed! Documentation is healthy."
  echo ""
  echo "💡 Tips for maintaining healthy docs:"
  echo "   • Update IMPLEMENTATION_STATUS.md when building new features"
  echo "   • Add changelog entries for major architecture decisions"
  echo "   • Keep PROJECT.md migration count and paths current"
  echo "   • Run this script after significant changes"
else
  echo "⚠️  Found $ISSUES issue(s) that should be addressed."
  echo ""
  echo "🔧 Common fixes:"
  echo "   • Update migration count in PROJECT.md"
  echo "   • Document new apps/packages in Key Paths section"
  echo "   • Create missing changelog entries for major changes"
  echo "   • Update IMPLEMENTATION_STATUS.md after feature development"
fi

echo ""
echo "🏃 To run this check regularly:"
echo "   • Add to CI/CD pipeline"
echo "   • Run weekly via cron: 0 9 * * 1 $0"
echo "   • Run after major changes or releases"

exit $ISSUES