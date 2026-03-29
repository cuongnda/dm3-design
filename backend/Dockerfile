# Stage 1: Build all 4 Go service binaries
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build all services
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/device-gateway ./cmd/device-gateway/ && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/access-svc     ./cmd/access-svc/  && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/identity-svc   ./cmd/identity-svc/ && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/auth-svc       ./cmd/auth-svc/

# Stage 2: Minimal runtime image
FROM alpine:3.19

RUN apk add --no-cache ca-certificates postgresql-client tzdata

WORKDIR /app

# Copy binaries
COPY --from=builder /build/bin/ /app/bin/

# Copy migrations (used by migrate service)
COPY pkg/db/migrations/ /app/migrations/

# Copy i18n locale files
COPY pkg/i18n/locales/ /app/pkg/i18n/locales/

# Copy migration runner script
COPY scripts/migrate.sh /app/scripts/migrate.sh
RUN chmod +x /app/scripts/migrate.sh

# Entrypoint: pick binary based on SERVICE_NAME env var
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
