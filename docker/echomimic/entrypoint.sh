#!/bin/bash
# EchoMimic V3 entrypoint — downloads models then starts service
set -e

MODELS_DIR="/app/models"
VARIANT="${ECHOMIMIC_VARIANT:-flash-pro}"

echo "=== EchoMimic V3 Service (${VARIANT}) ==="
echo "Models directory: ${MODELS_DIR}"

# Download models if not present
python3 /app/echomimic_service.py --download-only

echo "Models ready. Starting FastAPI service on port 8086..."
exec uvicorn echomimic_service:app --host 0.0.0.0 --port 8086 --workers 1
