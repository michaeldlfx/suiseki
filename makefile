.DEFAULT_GOAL := help

BINARY := bin/suiseki
ENTRYPOINT := src/cli.ts

.PHONY: help install install-frozen run build start test check check-ci format clean

help: ## show this help
	@echo "usage: make <target>"
	@echo ""
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | \
		awk -F ':.*## ' '{ printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }'

# development

install: ## install dependencies
	bun install

install-frozen: ## install dependencies from lockfile
	bun install --frozen-lockfile

run: ## run project as typescript sources
	bun dev

build: ## build binary
	bun build $(ENTRYPOINT) --compile --outfile $(BINARY)

start: ## run build binary
	./$(BINARY)

clean: ## remove build artifacts and caches
	rm -rf bin dist

# code quality
test: ## run all tests with coverage
	bun test --pass-with-no-tests

check: ## type check + lint/format (auto-fix)
	bun check

check-ci: ## type check + lint (no auto-fix, for ci)
	bun check:ci

format: ## format code with biome
	bun format
