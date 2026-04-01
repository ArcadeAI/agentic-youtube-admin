#!/bin/sh
set -e

echo "Applying database migrations..."
cd /app/packages/db
node node_modules/.bin/prisma migrate deploy
cd /app
echo "Migrations applied."

echo "Starting server..."
exec bun apps/server/dist/index.mjs
