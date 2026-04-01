#!/bin/sh
set -e

echo "Applying database migrations..."
bunx prisma migrate deploy --schema packages/db/prisma/schema
echo "Migrations applied."

echo "Starting server..."
exec bun run apps/server/dist/index.mjs
