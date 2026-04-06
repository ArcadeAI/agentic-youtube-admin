#!/bin/bash
set -e

# Start WARP daemon in background
warp-svc &
sleep 2

# Register (first run) and configure proxy mode
warp-cli registration new --accept-tos 2>/dev/null || true
warp-cli mode proxy
warp-cli proxy port 1080
warp-cli connect
sleep 2

# Verify WARP is connected
if warp-cli status | grep -q "Connected"; then
    echo "WARP connected successfully"
else
    echo "WARNING: WARP failed to connect, running without proxy"
fi

echo "Starting yt-proxy server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
