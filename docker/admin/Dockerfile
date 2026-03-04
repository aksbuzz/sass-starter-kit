# ── Stage 1: dependency install ───────────────────────────────────────────────
FROM node:20-slim AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json  ./packages/config/package.json
COPY packages/core/package.json    ./packages/core/package.json
COPY packages/db/package.json      ./packages/db/package.json
COPY packages/ui/package.json      ./packages/ui/package.json
COPY apps/admin/package.json       ./apps/admin/package.json

RUN pnpm install --frozen-lockfile --prod

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-slim AS runner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

COPY --from=deps /repo/node_modules                    ./node_modules
COPY --from=deps /repo/apps/admin/node_modules         ./apps/admin/node_modules
COPY --from=deps /repo/packages/config/node_modules    ./packages/config/node_modules
COPY --from=deps /repo/packages/core/node_modules      ./packages/core/node_modules
COPY --from=deps /repo/packages/db/node_modules        ./packages/db/node_modules

COPY package.json pnpm-workspace.yaml ./

COPY tsconfig.base.json                     ./tsconfig.base.json
COPY packages/config/package.json           ./packages/config/package.json
COPY packages/config/src                    ./packages/config/src
COPY packages/core/package.json             ./packages/core/package.json
COPY packages/core/tsconfig.json            ./packages/core/tsconfig.json
COPY packages/core/src                      ./packages/core/src
COPY packages/db/package.json               ./packages/db/package.json
COPY packages/db/src                        ./packages/db/src
COPY apps/admin/package.json                ./apps/admin/package.json
COPY apps/admin/tsconfig.json               ./apps/admin/tsconfig.json
COPY apps/admin/src                         ./apps/admin/src

EXPOSE 3002

CMD ["pnpm", "--filter", "@saas/admin", "run", "start"]
