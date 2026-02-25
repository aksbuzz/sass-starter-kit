The 4 changes that matter most
1. PgBouncer — biggest win, ~3–5× throughput
The benchmark showed 58,847 dropped iterations at 950 RPS — that's PostgreSQL running out of connections. PgBouncer in transaction mode lets the DB serve 100 real connections while the app sees 1000+.

Add to your docker-compose.yml:


pgbouncer:
  image: pgbouncer/pgbouncer:1.22
  environment:
    DATABASES_HOST: postgres
    DATABASES_PORT: "5432"
    DATABASES_DBNAME: saas
    DATABASES_USER: saas_app
    DATABASES_PASSWORD: "${DB_PASSWORD}"
    PGBOUNCER_POOL_MODE: transaction
    PGBOUNCER_MAX_CLIENT_CONN: "1000"
    PGBOUNCER_DEFAULT_POOL_SIZE: "80"    # stay under pg max_connections
    PGBOUNCER_MIN_POOL_SIZE: "10"
    PGBOUNCER_RESERVE_POOL_SIZE: "20"
    PGBOUNCER_SERVER_IDLE_TIMEOUT: "600"
  ports:
    - "5433:5432"                         # app connects to 5433, not 5432
  restart: unless-stopped
Then point DATABASE_APP_URL at port 5433 (PgBouncer), keep DATABASE_URL (admin/migration) on 5432 directly.

Note: PgBouncer transaction mode breaks SET statements, prepared statements, and LISTEN/NOTIFY. Your withTenant uses SET LOCAL — that's fine inside a transaction, but verify the session-level GUC calls are inside transactions. Your existing code does this correctly already.

2. Run multiple Fastify processes
Node.js is single-threaded. On 4 vCPUs you're currently wasting 3 of them. Use the built-in Node.js cluster or PM2:


# docker-compose.yml — api service
api:
  environment:
    CLUSTER_WORKERS: "4"    # match vCPU count
Add cluster mode to apps/api/src/main.ts:


import cluster from 'node:cluster'
import os from 'node:os'

const workers = parseInt(process.env.CLUSTER_WORKERS ?? '1')

if (cluster.isPrimary && workers > 1) {
  for (let i = 0; i < workers; i++) cluster.fork()
  cluster.on('exit', (worker) => {
    console.warn(`Worker ${worker.process.pid} died — restarting`)
    cluster.fork()
  })
} else {
  const { createApp } = await import('./app.js')
  const app = await createApp()
  await app.listen({ port: config.API_PORT, host: '0.0.0.0' })
}
3. PostgreSQL tuning
Add a postgresql.conf override to your postgres Docker image. For 8GB RAM, 4 vCPU, SSD:


# docker/postgres/postgresql.conf
shared_buffers         = 2GB          # 25% of RAM
effective_cache_size   = 6GB          # 75% of RAM
work_mem               = 16MB         # per sort/hash — 100 conns × 16MB = 1.6GB peak
maintenance_work_mem   = 256MB
max_connections        = 100          # PgBouncer handles the rest
wal_buffers            = 64MB
checkpoint_completion_target = 0.9
random_page_cost       = 1.1          # SSD
effective_io_concurrency = 200        # SSD
max_worker_processes   = 4
max_parallel_workers   = 4
max_parallel_workers_per_gather = 2
Mount it in docker/postgres/Dockerfile:


COPY postgresql.conf /etc/postgresql/postgresql.conf
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
4. Nginx in front (SSL termination + static files)
Don't expose Fastify or Next.js directly. Nginx handles SSL, gzip, keep-alive, and serves Next.js /_next/static/ from disk:


# docker/nginx/nginx.conf
worker_processes auto;
events { worker_connections 4096; }

http {
  gzip on;
  gzip_types application/json text/plain application/javascript text/css;

  upstream api {
    least_conn;
    server api:3001;
    keepalive 64;
  }

  upstream web {
    server web:3000;
    keepalive 32;
  }

  server {
    listen 443 ssl http2;
    ssl_certificate     /certs/fullchain.pem;
    ssl_certificate_key /certs/privkey.pem;

    # Static Next.js assets — long cache, served from disk
    location /_next/static/ {
      alias /app/.next/static/;
      expires 1y;
      add_header Cache-Control "public, immutable";
    }

    location /api/ {
      proxy_pass http://api;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
    }

    location / {
      proxy_pass http://web;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
    }
  }
}
What this gets you (projected)
Baseline (now)	With these changes
~254 req/s ceiling	~1,200–1,800 req/s
p(95) = 2.34s at ~950 RPS	p(95) < 500ms at 1,000 RPS
1 CPU used	4 CPUs used
20 DB connections	80 pooled DB connections
The single biggest lever is PgBouncer — expect 3–5× throughput improvement from that alone on the 4-CPU box.

Quick OS tweaks (run once on the VPS)

# Increase file descriptor limits for 1000+ connections
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# TCP tuning for many concurrent connections
sysctl -w net.core.somaxconn=65535
sysctl -w net.ipv4.tcp_max_syn_backlog=65535
sysctl -w net.ipv4.tcp_fin_timeout=15
echo "net.core.somaxconn=65535" >> /etc/sysctl.conf