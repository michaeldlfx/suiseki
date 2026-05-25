.DEFAULT_GOAL := help

BINARY := bin/suiseki

.PHONY: help install install-frozen run build release start clean test check check-ci format link setup init

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
	bun run dev

build: ## build binary (version stamped from package.json)
	bun run build

release: ## cross-compile all release targets into dist/ with checksums
	bun run build:release

start: ## run build binary
	bun run start

clean: ## remove build artifacts, release output, and coverage
	bun run clean

link: build ## (re)create the local bin/sat -> suiseki symlink
	@ln -sf suiseki "$(CURDIR)/bin/sat" && echo "linked sat -> suiseki view ($(CURDIR)/bin/sat)"

setup: link ## register suiseki + sat on PATH and create default config (~/.suiseki/config.toml)
	@chmod +x scripts/setup-path.sh && scripts/setup-path.sh "$(CURDIR)/bin"
	@./$(BINARY) config --init

init: install setup ## first-time setup: install deps, build binary, configure shell

# code quality
test: ## run all tests with coverage
	bun run test

check: ## type check + lint/format (auto-fix)
	bun run check

check-ci: ## type check + lint (no auto-fix, for ci)
	bun run check:ci

format: ## format code with biome
	bun run format
