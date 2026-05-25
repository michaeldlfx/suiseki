.DEFAULT_GOAL := help

BINARY := bin/suiseki

.PHONY: help install install-frozen run build release start clean test check check-ci format setup init

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

build: ## build binary (version stamped from package.json)
	@scripts/build.sh $(BINARY)

release: ## cross-compile all release targets into dist/ with checksums
	@scripts/build-release.sh

start: ## run build binary
	./$(BINARY)

clean: ## remove build artifacts and caches
	rm -rf bin dist

setup: build ## register suiseki + sat on PATH and create default config (~/.suiseki/config.toml)
	@chmod +x scripts/setup-path.sh && scripts/setup-path.sh "$(CURDIR)/bin"
	@ln -sf suiseki "$(CURDIR)/bin/sat" && echo "linked sat -> suiseki view ($(CURDIR)/bin/sat)"
	@./$(BINARY) config --init

init: install build setup ## first-time setup: install deps, build binary, configure shell

# code quality
test: ## run all tests with coverage
	bun test --pass-with-no-tests

check: ## type check + lint/format (auto-fix)
	bun check

check-ci: ## type check + lint (no auto-fix, for ci)
	bun check:ci

format: ## format code with biome
	bun format
