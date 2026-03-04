FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Install dependencies
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/scraper/package.json apps/scraper/
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY apps/scraper/ apps/scraper/

# Run with tsx (dev-friendly, no build step needed)
CMD ["pnpm", "--filter", "@mtg-au/scraper", "start"]
