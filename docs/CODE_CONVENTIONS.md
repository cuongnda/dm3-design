# CODE_CONVENTIONS.md — DM3 Coding Standards

## For AI Agents
Quick reference for generating code that matches DM3 patterns. This reduces "polish time" after code generation.

## Go Backend

### Project Structure
```
backend/
├── cmd/                    # Service entry points
│   ├── auth-svc/main.go   # Port 8005, JWT auth, user management
│   ├── access-svc/main.go # Port 8003, doors, events, rules
│   ├── identity-svc/main.go # Port 8004, persons, credentials, groups
│   └── device-gateway/main.go # Port 8002, device management, MQTT
├── internal/              # Private application code
│   ├── authsvc/          # Auth service handlers
│   ├── config/           # Configuration loading
│   ├── middleware/       # HTTP middleware (CORS, logging, auth)
│   └── models/          # Domain models with JSON tags
└── pkg/                  # Reusable packages
    ├── db/              # Database connection & migrations
    ├── httputil/        # HTTP utilities (JSON, error responses)
    └── i18n/            # Internationalization
```

### Service Initialization Pattern
```go
func main() {
    slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
    cfg := config.Load()
    
    ctx := context.Background()
    database, err := db.Connect(ctx, cfg.DatabaseURL)
    if err != nil {
        slog.Error("database connection failed", "error", err)
        os.Exit(1)
    }
    defer database.Close()
    
    // Run migrations
    if err := database.RunMigrations(ctx, "pkg/db/migrations"); err != nil {
        slog.Warn("migrations", "error", err)
    }
    
    h := authsvc.NewHandlers(database, cfg.JWTSecret)
    r := httputil.NewRouter()
    
    // Routes setup...
    addr := fmt.Sprintf(":%d", cfg.HTTPPort)
    slog.Info("starting service", "addr", addr)
    if err := http.ListenAndServe(addr, r); err != nil {
        slog.Error("server error", "error", err)
        os.Exit(1)
    }
}
```

### HTTP Handler Pattern
```go
func (h *Handlers) CreatePerson(w http.ResponseWriter, r *http.Request) {
    var req CreatePersonRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        httputil.Error(w, http.StatusBadRequest, "invalid JSON")
        return
    }
    
    person, err := h.db.CreatePerson(r.Context(), req)
    if err != nil {
        slog.Error("create person failed", "error", err)
        httputil.Error(w, http.StatusInternalServerError, "creation failed")
        return
    }
    
    httputil.JSON(w, http.StatusCreated, person)
}
```

### Error Handling
Standard JSON error responses with structured logging:
```go
// Always use httputil.Error for consistent error format
httputil.Error(w, http.StatusBadRequest, "validation failed")
httputil.Error(w, http.StatusNotFound, "person not found")

// Log errors with structured fields
slog.Error("database error", "error", err, "person_id", id)
```

### Database Queries
Uses `pgx` with connection pooling, no ORM:
```go
type DB struct {
    Pool *pgxpool.Pool
}

func (d *DB) CreatePerson(ctx context.Context, req CreatePersonRequest) (*Person, error) {
    const query = `
        INSERT INTO dm3_identity.persons (first_name, last_name, email, tenant_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id, created_at, updated_at`
    
    var p Person
    err := d.Pool.QueryRow(ctx, query, req.FirstName, req.LastName, req.Email, tenantID).
        Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
    return &p, err
}
```

### Config Loading
Environment-first with fallbacks:
```go
type Config struct {
    HTTPPort    int
    DatabaseURL string
    JWTSecret   string
}

func Load() *Config {
    return &Config{
        HTTPPort:    envInt("HTTP_PORT", 8002),
        DatabaseURL: env("DATABASE_URL", "postgres://dm3:dm3secret@localhost:5433/dm3?sslmode=disable"),
        JWTSecret:   env("JWT_SECRET", "dm3-dev-secret-key"),
    }
}
```

### Logging
Structured logging with `log/slog`:
```go
slog.Info("starting service", "addr", addr, "version", version)
slog.Error("database error", "error", err, "table", "persons")
slog.Warn("migration issue", "file", filename, "error", err)
```

### Router Setup
```go
func NewRouter() chi.Router {
    r := chi.NewRouter()
    r.Use(chimw.RequestID)
    r.Use(chimw.RealIP)
    r.Use(middleware.Logging)
    r.Use(middleware.CORS())
    r.Use(chimw.Recoverer)
    return r
}
```

## TypeScript/React Frontend

### Feature Module Structure
```
apps/console/src/features/devices/
├── DevicesPage.tsx        # Main list page
├── DeviceDetailPage.tsx   # Detail/edit page
├── PendingDevicesPage.tsx # Sub-feature page
└── ProvisionDevicePage.tsx # Creation page
```

### Component Pattern
Functional components with TypeScript:
```tsx
interface Props {
  device: DeviceDTO;
  onUpdate: (device: DeviceDTO) => void;
}

export function DeviceCard({ device, onUpdate }: Props) {
  const { t } = useTranslation('devices');
  const updateDevice = useUpdateDevice();
  
  const handleSubmit = async (data: UpdateDeviceRequest) => {
    try {
      const updated = await updateDevice.mutateAsync({ id: device.id, data });
      onUpdate(updated);
    } catch (error) {
      // TanStack Query handles error display
    }
  };
  
  return (
    <Card>
      <CardContent>
        {/* Component content */}
      </CardContent>
    </Card>
  );
}
```

### State Management
Zustand stores with persistence:
```tsx
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => {
        clearToken();
        set({ user: null, isAuthenticated: false });
      },
      // ... other methods
    }),
    { name: 'dm3-auth' }
  )
);
```

### API Calls
TanStack Query hooks from `@dm3/api-client`:
```tsx
// List data
export function useDevicesList() {
  return useQuery({ 
    queryKey: ['devices'], 
    queryFn: () => listDevices() 
  });
}

// Mutations with cache invalidation
export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDeviceRequest) => createDevice(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });
}
```

### Styling
Tailwind classes with shadcn/ui components:
```tsx
// Consistent status color patterns
const statusColors: Record<string, string> = {
  online: 'bg-[#22C55E]/10 text-[#22C55E]',
  offline: 'bg-[#64748B]/10 text-[#64748B]',
  provisioning: 'bg-[#3B82F6]/10 text-[#3B82F6]',
  disabled: 'bg-[#EF4444]/10 text-[#EF4444]',
};

// Use Badge component for status
<Badge className={cn('text-xs', statusColors[device.status])}>
  {t(`status.${device.status}`)}
</Badge>
```

### File Naming
- **Pages:** `PascalCase.tsx` (e.g., `DevicesPage.tsx`)
- **Components:** `PascalCase.tsx` (e.g., `DeviceCard.tsx`)
- **Hooks:** `camelCase.ts` (e.g., `useDeviceStatus.ts`)
- **Utilities:** `camelCase.ts` (e.g., `formatDate.ts`)

### Import Order
```tsx
// 1. React & external libraries
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// 2. UI components (aliased imports)
import { Button, Card, CardContent } from '@dm3/ui';

// 3. API & types
import { useDevicesList, type DeviceDTO } from '@dm3/api-client';

// 4. Internal imports
import { useAuthStore } from '@/stores/authStore';
import { formatDate } from '@/lib/utils';
```

## Shared Patterns

### Types/Interfaces
- **Backend:** Defined in `internal/models/` with JSON tags
- **Frontend:** Generated from backend in `packages/api-client/src/types/`
- **Naming:** `PascalCase` for interfaces, `camelCase` for fields

```go
// Go model
type Person struct {
    ID        string    `json:"id"`
    TenantID  string    `json:"tenant_id"`
    FirstName string    `json:"first_name"`
    LastName  string    `json:"last_name"`
    CreatedAt time.Time `json:"created_at"`
}
```

```tsx
// TypeScript interface (matches JSON)
interface PersonDTO {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  created_at: string; // ISO string
}
```

### Error Handling (Frontend)
TanStack Query handles errors automatically; toast notifications on mutations:
```tsx
const createDevice = useCreateDevice();

const handleSubmit = async (data: CreateDeviceRequest) => {
  try {
    await createDevice.mutateAsync(data);
    toast.success('Device created successfully');
  } catch (error) {
    // TanStack Query error is already logged
    toast.error('Failed to create device');
  }
};
```

### Real-time Updates
WebSocket integration via `@dm3/api-client`:
```tsx
// In App.tsx - mount when authenticated
{isAuthenticated && <RealtimeProvider />}

// In components - consume real-time data
const deviceStatuses = useDeviceStatus();
const isConnected = useRealtimeStore((s) => s.connected);

// Merge API data with real-time updates
const devicesWithStatus = devices.map(device => ({
  ...device,
  status: realtimeStatus?.find(s => s.deviceId === device.id)?.status || device.status
}));
```

## Anti-Patterns (Don't Do This)

### Backend
- **Don't** use `interface{}` — prefer specific types
- **Don't** ignore error handling — always log and return appropriate HTTP status
- **Don't** use global variables for config — pass through function parameters
- **Don't** hardcode tenant IDs — extract from JWT context

### Frontend
- **Don't** use `any` types — define proper interfaces
- **Don't** fetch directly with `fetch()` — use TanStack Query hooks from `@dm3/api-client`
- **Don't** use `click` events for autocomplete — use `mousedown` (prevents blur issues)
- **Don't** use empty string for FK fields — use `null` for proper SQL handling
- **Don't** forget to handle loading/error states in components

### Database
- **Don't** use string concatenation for queries — use parameterized queries
- **Don't** forget tenant isolation — all queries must include `tenant_id` filter
- **Don't** use `SELECT *` — specify columns explicitly

### General
- **Don't** use `git push --no-verify` — let pre-commit hooks run
- **Don't** hardcode URLs — use environment variables
- **Don't** commit `.env` files — use `.env.example` for templates
- **Don't** bypass TypeScript errors with `@ts-ignore` — fix the underlying issue

## Migration Patterns
Numbered SQL files in `backend/pkg/db/migrations/`:
```sql
-- 001_initial.sql
CREATE SCHEMA IF NOT EXISTS dm3_devices;

CREATE TABLE IF NOT EXISTS dm3_devices.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    device_id VARCHAR(20) NOT NULL UNIQUE,
    -- other fields...
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant ON dm3_devices.devices(tenant_id);
```

## WebSocket Events
Structured event format:
```go
type WSEvent struct {
    Type     string    `json:"type"`
    DeviceID string    `json:"device_id"`
    TenantID string    `json:"tenant_id"`
    Data     any       `json:"data"`
    Time     time.Time `json:"time"`
}
```

This document serves as the single source of truth for coding patterns in DM3. Always reference actual code when extending these conventions.