# Stage 1: Build all 5 Go service binaries
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git ca-certificates
RUN go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.18.1

WORKDIR /build

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build all services
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/device-gateway ./cmd/device-gateway/ && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/access-svc     ./cmd/access-svc/  && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/identity-svc   ./cmd/identity-svc/ && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/auth-svc       ./cmd/auth-svc/ && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/audit-svc      ./cmd/audit-svc/ && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/visitor-svc    ./cmd/visitor-svc/

# Stage 2: Minimal runtime image
FROM alpine:3.19

RUN apk add --no-cache ca-certificates postgresql-client tzdata

WORKDIR /app

# Copy binaries
COPY --from=builder /build/bin/ /app/bin/
COPY --from=builder /go/bin/migrate /usr/local/bin/migrate

# Copy migrations (used by migrate service)
COPY pkg/db/migrations/ /app/migrations/

# Create data directory for uploaded photos/avatars
RUN mkdir -p /app/data/photos

# Copy i18n locale files
COPY pkg/i18n/locales/ /app/pkg/i18n/locales/

# Copy migration runner script
COPY scripts/migrate.sh /app/scripts/migrate.sh
RUN chmod +x /app/scripts/migrate.sh

# Entrypoint: pick binary based on SERVICE_NAME env var
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
