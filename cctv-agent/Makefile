VERSION ?= dev
LDFLAGS := -s -w -X main.version=$(VERSION)
PKG := ./cmd/cctv-agent

.PHONY: tidy build-linux build-windows build-all clean run lint

tidy:
	go mod tidy

build-linux:
	CGO_ENABLED=0 GOOS=linux   GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o bin/cctv-agent-linux-amd64 $(PKG)

build-windows:
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o bin/cctv-agent-windows-amd64.exe $(PKG)

build-all: build-linux build-windows
	@ls -lh bin/

run:
	go run $(PKG) -config agent.yml

lint:
	go vet ./...

clean:
	rm -rf bin/
