#!/bin/bash
set -e

NAME=${1:?"Usage: ./scripts/create-migration.sh <migration-name>"}
CONTAINER="pg-migrate-$$"
PORT=5433
DB_DIR="packages/db"

echo "Starting temporary Postgres..."
docker run --rm -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ytadmin \
  -p $PORT:5432 --name "$CONTAINER" postgres:16
trap "docker stop $CONTAINER 2>/dev/null" EXIT
sleep 3

DB_URL="postgresql://postgres:postgres@localhost:$PORT/ytadmin"

echo "Applying existing migrations to reach current state..."
cd "$DB_DIR"
DATABASE_URL="$DB_URL" bunx prisma migrate deploy
echo ""

echo "Generating migration: $NAME..."
DATABASE_URL="$DB_URL" bunx prisma migrate dev --name "$NAME"
cd - > /dev/null

echo ""
echo "Done. Review the new migration in $DB_DIR/prisma/migrations/"
