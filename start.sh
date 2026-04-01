#!/bin/sh
set -e

echo "Applying database migrations..."
cd /app/packages/db
bun run db:deploy
cd /app
echo "Migrations applied."

echo "Starting server..."
exec bun run apps/server/dist/index.mjs
