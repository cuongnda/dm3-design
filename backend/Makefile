.PHONY: build test lint docker-up docker-down migrate seed dev clean

SERVICES := device-gateway access-svc identity-svc auth-svc audit-svc
BIN_DIR := bin

build:
	@mkdir -p $(BIN_DIR)
	@for svc in $(SERVICES); do \
		echo "Building $$svc..."; \
		go build -o $(BIN_DIR)/$$svc ./cmd/$$svc/; \
	done
	@echo "Build complete"

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

dev: docker-up migrate
	@sleep 2
	go run ./cmd/device-gateway/

clean:
	rm -rf $(BIN_DIR)
	docker compose down -v
