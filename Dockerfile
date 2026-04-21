FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY packages/base/package.json packages/base/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm --filter @kotonoha/types build
RUN pnpm --filter @kotonoha/web build
RUN pnpm deploy --filter @kotonoha/web --prod --legacy /app/deployed

FROM node:22-slim AS production
WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY --from=base /app/deployed/node_modules ./node_modules
COPY --from=base /app/apps/web/build ./build
COPY --from=base /app/deployed/package.json ./

ENV PORT=3000
EXPOSE 3000
CMD ["node", "./build/index.js"]
