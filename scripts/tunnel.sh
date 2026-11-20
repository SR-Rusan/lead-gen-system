#!/bin/bash
# Resilient public webhook tunnel for port 3001
while true; do
  echo "[Tunnel] Starting public tunnel on port 3001..."
  npx --yes localtunnel --port 3001
  echo "[Tunnel] Tunnel disconnected, restarting in 3 seconds..."
  sleep 3
done
