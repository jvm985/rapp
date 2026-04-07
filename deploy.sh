#!/bin/bash
set -e

echo "🚀 Deploying New R App..."
sudo docker compose down
sudo docker compose up -d --build
sudo docker image prune -f
echo "✅ Deployment finished!"
