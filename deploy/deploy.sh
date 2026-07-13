#!/usr/bin/env bash
# Run on the EC2 instance (from inside the repo) to pull and apply the
# latest committed changes. Frontend rebuilds take effect immediately;
# backend changes need the service restart this script also does.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Pulling latest code..."
git pull

echo "==> Installing backend dependencies..."
cd backend
.venv/bin/pip install -q -r requirements.txt
cd ..

echo "==> Building frontend..."
cd frontend
npm ci
npm run build
cd ..

echo "==> Restarting the backend service..."
sudo systemctl restart bit-code-lab

echo "Done."
