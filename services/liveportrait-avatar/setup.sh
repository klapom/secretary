#!/bin/bash
# LivePortrait Avatar Service Setup Script

set -e

echo "=========================================="
echo "LivePortrait Avatar Service Setup"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker found${NC}"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker Compose found${NC}"

# Check nvidia-docker
if ! docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
    echo -e "${YELLOW}Warning: nvidia-docker may not be configured correctly${NC}"
    echo -e "${YELLOW}Attempting to continue anyway...${NC}"
else
    echo -e "${GREEN}✓ nvidia-docker working${NC}"
fi

echo ""
echo "Building Docker image..."
docker-compose build

echo ""
echo "Creating directories..."
mkdir -p models
mkdir -p output
mkdir -p tests/fixtures

echo ""
echo "Starting service..."
docker-compose up -d

echo ""
echo "Waiting for service to initialize..."
sleep 10

# Wait for health check
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s http://localhost:8001/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Service is healthy${NC}"
        break
    fi
    echo "Waiting for service... (attempt $((ATTEMPT+1))/$MAX_ATTEMPTS)"
    sleep 2
    ATTEMPT=$((ATTEMPT+1))
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e "${RED}Error: Service failed to become healthy${NC}"
    echo "Check logs with: docker-compose logs"
    exit 1
fi

echo ""
echo "Service Details:"
curl -s http://localhost:8001/health | python3 -m json.tool || echo "Failed to fetch health"

echo ""
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Service is running at: http://localhost:8001"
echo ""
echo "Quick Commands:"
echo "  make logs         - View service logs"
echo "  make health       - Check service health"
echo "  make test-render  - Test rendering"
echo "  make stop         - Stop service"
echo ""
echo "API Documentation: http://localhost:8001/docs"
