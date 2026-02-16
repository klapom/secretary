#!/bin/bash
# Start Voice Pipeline Service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🎤 Starting Voice Pipeline Service..."

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Please run setup.sh first."
    exit 1
fi

# Activate venv
source venv/bin/activate

# Check if service is already running
if curl -s http://localhost:8765/health > /dev/null 2>&1; then
    echo "⚠️  Service already running on port 8765"
    exit 0
fi

# Start service
echo "🚀 Starting service on port 8765..."
python voice_service.py
