.PHONY: up dev down test test-unit test-e2e lint typecheck format format-check quality

up:
	podman compose -f compose.yaml up --build

dev:
	podman compose --in-pod=false -f compose.yaml -f compose.dev.yaml up

down:
	podman compose -f compose.yaml down -v

test:
	podman compose -f compose.yaml --profile test run --rm tests

test-unit:
	podman compose -f compose.yaml --profile test run --rm tests npm run test:unit

test-e2e:
	@status=0; \
	podman compose --env-file .env.e2e -f compose.yaml -p flight-e2e --profile e2e up --build --force-recreate --abort-on-container-exit --exit-code-from e2e || status=$$?; \
	if [ $$status -eq 0 ]; then \
		podman compose --env-file .env.e2e -f compose.yaml -p flight-e2e --profile e2e down -v; \
	else \
		echo "E2E failed; stack left for inspection. Clean with: podman compose --env-file .env.e2e -f compose.yaml -p flight-e2e --profile e2e down -v"; \
	fi; \
	exit $$status

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
