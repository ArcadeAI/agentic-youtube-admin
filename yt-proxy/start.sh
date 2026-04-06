#!/bin/bash
set -e

# Start D-Bus (required by warp-svc)
mkdir -p /run/dbus
rm -f /run/dbus/pid
dbus-daemon --config-file=/usr/share/dbus-1/system.conf

# Start WARP daemon
warp-svc --accept-tos &
sleep 2

# Register with retry loop (daemon may not be ready immediately)
MAX_ATTEMPTS=10
attempt=0
until warp-cli --accept-tos registration new 2>/dev/null; do
  attempt=$((attempt + 1))
  echo "Waiting for warp-svc... attempt $attempt/$MAX_ATTEMPTS"
  if [ $attempt -ge $MAX_ATTEMPTS ]; then
    echo "WARNING: WARP registration failed after $MAX_ATTEMPTS attempts"
    break
  fi
  sleep 1
done

# Configure proxy mode (no TUN device needed)
warp-cli --accept-tos mode proxy
warp-cli --accept-tos proxy port 1080
warp-cli --accept-tos connect
sleep 2

# Verify connection
if warp-cli --accept-tos status | grep -iq connected; then
  echo "WARP proxy connected on port 1080"
else
  echo "WARNING: WARP failed to connect, running without proxy"
fi

echo "Starting yt-proxy server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
