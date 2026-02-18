#!/bin/bash
# Setup Voice Pipeline Service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🎤 Voice Pipeline Service - Setup"
echo "=================================="

# Check Python version
echo "Checking Python version..."
python3 --version

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
else
    echo "Virtual environment already exists"
fi

# Activate venv
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install PyTorch (CPU version for ARM64)
echo "Installing PyTorch..."
pip install torch torchvision torchaudio

# Install dependencies
echo "Installing voice pipeline dependencies..."
pip install -r requirements.txt

# Create directories
echo "Creating directories..."
mkdir -p voice_profiles
mkdir -p models

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start the service: ./start.sh"
echo "  2. Run tests: source venv/bin/activate && python test_voice.py"
echo "  3. Check health: curl http://localhost:8765/health"
echo ""
echo "Service will run on: http://localhost:8765"
