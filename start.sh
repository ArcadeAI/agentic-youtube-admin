#!/bin/sh
set -e

echo "Applying database migrations..."
cd /app/packages/db

# If no migration history exists (DB was set up with db:push),
# baseline the init migration so it won't try to re-create existing tables.
if ! node node_modules/.bin/prisma migrate status 2>&1 | grep -q "20260406003538_init"; then
  echo "Baselining init migration for existing database..."
  node node_modules/.bin/prisma migrate resolve --applied 20260406003538_init || true
fi

node node_modules/.bin/prisma migrate deploy
cd /app
echo "Migrations applied."

echo "Starting server..."
exec bun apps/server/dist/index.mjs
