.PHONY: dev build docker-up docker-down lint typecheck hash-password

dev:
	pnpm dev:web

build:
	pnpm build:web

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

lint:
	pnpm -r lint

typecheck:
	pnpm -r typecheck

hash-password:
	@read -p "Password: " pass && node -e "import('bcrypt').then(b=>b.hash('$$pass',10)).then(console.log)"
