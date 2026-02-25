# ── Stage 1: dependency install ───────────────────────────────────────────────
# Installs only production dependencies using pnpm workspaces.
# Copying package.json files first allows Docker to cache this layer until
# dependency definitions actually change.
FROM node:20-slim AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

# Copy workspace manifests (needed for pnpm workspace resolution)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json  ./packages/config/package.json
COPY packages/db/package.json       ./packages/db/package.json
COPY packages/ui/package.json       ./packages/ui/package.json
COPY apps/api/package.json          ./apps/api/package.json

# Install production deps only (tsx is now in dependencies, not devDependencies)
RUN pnpm install --frozen-lockfile --prod

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
# Minimal image with Node + pnpm, the installed node_modules, and the TypeScript
# source. tsx transpiles on startup — no separate compile step needed because
# @saas/config and @saas/db export their TypeScript source directly.
FROM node:20-slim AS runner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

# Copy installed node_modules from deps stage
COPY --from=deps /repo/node_modules          ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /repo/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /repo/packages/db/node_modules     ./packages/db/node_modules

# pnpm needs workspace manifest + root package.json to resolve filter paths
COPY package.json pnpm-workspace.yaml ./

# Copy TypeScript source for all packages the API depends on
COPY tsconfig.base.json                     ./tsconfig.base.json
COPY packages/config/src                    ./packages/config/src
COPY packages/db/src                        ./packages/db/src
COPY apps/api/src                           ./apps/api/src
COPY apps/api/tsconfig.json                 ./apps/api/tsconfig.json
COPY apps/api/package.json                  ./apps/api/package.json
COPY packages/config/package.json           ./packages/config/package.json
COPY packages/db/package.json               ./packages/db/package.json

EXPOSE 3001

# pnpm resolves tsx from the api package's local node_modules and runs the
# start script ("tsx src/main.ts"), which handles TypeScript source from
# @saas/config and @saas/db transparently via tsx's module loader.
CMD ["pnpm", "--filter", "@saas/api", "run", "start"]
