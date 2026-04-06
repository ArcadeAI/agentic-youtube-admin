#!/bin/bash
set -e

NAME=${1:?"Usage: ./scripts/create-migration.sh <migration-name>"}
SCHEMA="packages/db/prisma/schema"
CONTAINER="pg-migrate-$$"
PORT=5433

echo "Starting temporary Postgres..."
docker run --rm -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ytadmin \
  -p $PORT:5432 --name "$CONTAINER" postgres:16
trap "docker stop $CONTAINER 2>/dev/null" EXIT
sleep 3

export DATABASE_URL="postgresql://postgres:postgres@localhost:$PORT/ytadmin"

echo "Applying existing migrations to reach current state..."
bunx prisma migrate deploy --schema "$SCHEMA" --url "$DATABASE_URL"

echo "Generating migration: $NAME..."
bunx prisma migrate dev --name "$NAME" --schema "$SCHEMA" --url "$DATABASE_URL"

echo "Done. New migration created."
