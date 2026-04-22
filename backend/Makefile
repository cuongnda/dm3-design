.PHONY: build test lint docker-up docker-down migrate seed seed-api dev clean swag swag-check

SERVICES := device-gateway access-svc identity-svc auth-svc audit-svc visitor-svc parking-svc cctv-svc attend-svc
BIN_DIR := bin
SWAG := $(shell go env GOPATH)/bin/swag

build:
	@mkdir -p $(BIN_DIR)
	@for svc in $(SERVICES); do \
		echo "Building $$svc..."; \
		go build -o $(BIN_DIR)/$$svc ./cmd/$$svc/; \
	done
	@echo "Build complete"

# swag regenerates docs/swagger.{json,yaml,.go} from swaggo annotations on
# auth-svc handlers. The generated files are committed so the spec stays
# reviewable in PRs; CI runs `make swag-check` to catch drift.
swag:
	@if [ ! -x "$(SWAG)" ]; then \
		echo "Installing swaggo/swag..."; \
		go install github.com/swaggo/swag/cmd/swag@latest; \
	fi
	@echo "Regenerating OpenAPI spec from auth-svc annotations..."
	@$(SWAG) init -g cmd/auth-svc/main.go -o docs --outputTypes json,yaml --parseDependency --parseInternal --quiet

# swag-check fails if `make swag` produces a diff — use in CI to enforce that
# annotations and the committed spec stay in sync.
swag-check: swag
	@git diff --exit-code -- docs/ || (echo "ERROR: OpenAPI spec drift detected. Run 'make swag' and commit docs/." && exit 1)

test:
	go test ./... -v -race

lint:
	golangci-lint run ./...

docker-up:
	docker compose up -d
	@echo "Waiting for services to be healthy..."
	@sleep 5

docker-down:
	docker compose down

migrate:
	@echo "Running migrations..."
	@set -e; \
	for file in $$(find pkg/db/migrations -name '*.up.sql' | sort); do \
		echo "Applying $$file..."; \
		PGPASSWORD=dm3secret psql -h localhost -p 5433 -U dm3 -d dm3 -f "$$file"; \
	done

seed:
	@echo "Running seed data..."
	PGPASSWORD=dm3secret psql -h localhost -p 5433 -U dm3 -d dm3 -f scripts/seed.sql

seed-all:
	@echo "Running comprehensive seed (all modules)..."
	PGPASSWORD=dm3secret psql -h localhost -p 5433 -U dm3 -d dm3 -f scripts/seed_all.sql

seed-api:
	@echo "Running API-based seed (all modules)..."
	@/bin/bash scripts/seed_all.sh

seed-visitors:
	@./scripts/seed_visitors.sh

dev: docker-up migrate
	@sleep 2
	go run ./cmd/device-gateway/

clean:
	rm -rf $(BIN_DIR)
	docker compose down -v
