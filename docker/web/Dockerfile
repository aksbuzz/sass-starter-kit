# Stage 1: deps
FROM node:20-slim AS deps
ENV PNPM_HOME="/pnpm" PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json ./packages/config/package.json
COPY packages/ui/package.json     ./packages/ui/package.json
COPY apps/web/package.json        ./apps/web/package.json
RUN pnpm install --frozen-lockfile

# Stage 2: Vite build
FROM deps AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules                  ./node_modules
COPY --from=deps /repo/apps/web/node_modules         ./apps/web/node_modules
COPY --from=deps /repo/packages/ui/node_modules      ./packages/ui/node_modules
COPY --from=deps /repo/packages/config/node_modules  ./packages/config/node_modules
COPY tsconfig.base.json  ./tsconfig.base.json
COPY packages/config/src ./packages/config/src
COPY packages/ui/src     ./packages/ui/src
COPY apps/web            ./apps/web
ARG VITE_API_URL=http://localhost:3001
ARG VITE_ADMIN_API_URL=http://localhost:3002
ARG VITE_WEB_URL=http://localhost:3000
ARG VITE_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ADMIN_API_URL=$VITE_ADMIN_API_URL
ENV VITE_WEB_URL=$VITE_WEB_URL
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY
RUN pnpm --filter @saas/web build

# Stage 3: nginx
FROM nginx:1.27-alpine AS runner
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
