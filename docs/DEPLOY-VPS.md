# VPS Deployment (PostgreSQL Production)

This project now uses a single Prisma schema (`prisma/schema.prisma`) with PostgreSQL as the only production database path.

## 1. Prerequisites

- Ubuntu VPS with Node.js 20+ (22 recommended)
- pnpm (`npm i -g pnpm`)
- PostgreSQL 15+ (same host or managed service)

## 2. Clone and install

```bash
cd ~
git clone https://github.com/TheGreatToba/todolist.git
cd todolist
pnpm install --frozen-lockfile
```

## 3. Environment file

```bash
cp .env.example .env
```

Minimum production variables:

```env
DATABASE_URL="postgresql://app_user:app_password@127.0.0.1:5432/todolist?schema=public"
NODE_ENV="production"
JWT_SECRET="<openssl rand -base64 32>"
TRUST_PROXY="true"
COOKIE_SECURE="true"
ALLOWED_ORIGINS="https://app.example.com"
PORT=3000
```

Optional unless cron endpoint is enabled:

```env
CRON_SECRET="<openssl rand -base64 32>"
```

## 4. Build and migrate

```bash
pnpm run build
pnpm exec prisma migrate deploy
pnpm run seed   # optional, only for demo/bootstrap
```

## 5. Start server

```bash
pnpm start
```

Health checks:

- `GET /health/live`
- `GET /health/ready`

## 6. systemd (recommended)

Use `deploy/todolist.service` and set the correct:

- `User`
- `WorkingDirectory`
- `EnvironmentFile`
- `ExecStart` (Node path if using nvm)

Then:

```bash
sudo cp deploy/todolist.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable todolist
sudo systemctl start todolist
sudo systemctl status todolist
journalctl -u todolist -f
```

## 7. Reverse proxy

If running behind nginx:

- keep `TRUST_PROXY="true"`
- keep `COOKIE_SECURE="true"` with HTTPS
- forward `X-Forwarded-For` and `X-Forwarded-Proto`

## 8. Database operations

Production DB operations (durability settings, backup, restore, PITR) are documented in `docs/PRODUCTION-POSTGRES-RUNBOOK.md`.
