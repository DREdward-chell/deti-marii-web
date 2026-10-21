.PHONY: help init up down logs db api web check backend-check frontend-check

help:
	@echo "init           Prepare local configuration and install frontend dependencies"
	@echo "up / down      Start / stop the full Docker Compose stack"
	@echo "db             Start PostgreSQL for local development"
	@echo "api / web      Run backend / frontend locally (separate terminals)"
	@echo "check          Verify backend and frontend (Docker required for backend tests)"
	@echo "logs           Follow application logs"

.env:
	cp .env.example .env

init: .env
	npm ci

up: .env
	docker compose up --build -d --wait

down:
	docker compose down

logs:
	docker compose logs -f backend web

db: .env
	docker compose -f compose.yaml -f compose.dev.yaml up -d --wait postgres

api: .env
	set -a; . ./.env; set +a; cd backend && ./gradlew bootRun

web:
	npm run dev

check: backend-check frontend-check

backend-check:
	cd backend && ./gradlew check

frontend-check:
	npm run check
