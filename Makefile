.PHONY: up dev down test test-unit lint typecheck format format-check quality

up:
	podman compose -f compose.yaml up --build

dev:
	podman compose -f compose.yaml -f compose.dev.yaml up

down:
	podman compose -f compose.yaml down -v

test:
	podman compose -f compose.yaml --profile test run --rm tests

test-unit:
	podman compose -f compose.yaml --profile test run --rm tests npm run test:unit

lint:
	npm run lint

typecheck:
	npm run typecheck

format:
	npm run format

format-check:
	npm run format:check

quality:
	npm run quality
