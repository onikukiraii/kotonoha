.PHONY: dev build docker-up docker-down prod-up prod-down prod-logs lint typecheck test hash-password

dev:
	pnpm dev:web

build:
	pnpm build:web

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

prod-up:
	docker compose -f compose.prod.yaml up -d --build

prod-down:
	docker compose -f compose.prod.yaml down

prod-logs:
	docker compose -f compose.prod.yaml logs -f

lint:
	pnpm -r lint

typecheck:
	pnpm -r typecheck

test:
	pnpm -r test
	cd apps/desktop/src-tauri && cargo test --lib

hash-password:
	@read -p "Password: " pass && node -e "import('bcrypt').then(b=>b.hash('$$pass',10)).then(console.log)"
