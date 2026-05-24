# syntax=docker/dockerfile:1.7
# ---------- builder ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install build deps for better-sqlite3 (compiles a native module).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json biome.json ./
COPY src ./src
RUN pnpm build

# Strip dev deps for the runner stage.
RUN pnpm prune --prod

# ---------- runner ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4242

RUN groupadd --system --gid 10001 a2a && \
    useradd  --system --uid 10001 --gid a2a --home /app a2a && \
    mkdir -p /app/data && chown -R a2a:a2a /app

COPY --from=builder --chown=a2a:a2a /app/node_modules ./node_modules
COPY --from=builder --chown=a2a:a2a /app/dist ./dist
COPY --from=builder --chown=a2a:a2a /app/package.json ./package.json

USER a2a
EXPOSE 4242
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||4242) +'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
