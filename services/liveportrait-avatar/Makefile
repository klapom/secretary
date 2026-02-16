.PHONY: build run stop test clean logs health

# Build Docker image
build:
	docker-compose build

# Start service
run:
	docker-compose up -d

# Stop service
stop:
	docker-compose down

# View logs
logs:
	docker-compose logs -f

# Check service health
health:
	@echo "Checking LivePortrait service health..."
	@curl -s http://localhost:8001/health | python -m json.tool || echo "Service not ready"

# Run tests
test:
	pytest tests/ -v

# Clean up
clean:
	docker-compose down -v
	rm -rf output/
	rm -rf __pycache__/
	rm -rf app/__pycache__/
	rm -rf tests/__pycache__/

# GPU check
gpu-check:
	docker exec liveportrait-avatar nvidia-smi

# Shell into container
shell:
	docker exec -it liveportrait-avatar /bin/bash

# Rebuild and restart
rebuild: stop clean build run

# Check CUDA
cuda-check:
	docker exec liveportrait-avatar python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA version: {torch.version.cuda}'); print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"None\"}')"

# Test render
test-render:
	@echo "Testing render endpoint..."
	curl -X POST http://localhost:8001/render \
		-F "source_image=@tests/fixtures/test_portrait.jpg" \
		-F "emotion=happy" \
		-F "intensity=0.8" | python -m json.tool

# Get metrics
metrics:
	curl -s http://localhost:8001/metrics

# Help
help:
	@echo "LivePortrait Avatar Service - Available Commands:"
	@echo ""
	@echo "  make build        - Build Docker image"
	@echo "  make run          - Start service"
	@echo "  make stop         - Stop service"
	@echo "  make logs         - View service logs"
	@echo "  make health       - Check service health"
	@echo "  make test         - Run unit tests"
	@echo "  make clean        - Clean up containers and files"
	@echo "  make gpu-check    - Check GPU availability"
	@echo "  make cuda-check   - Check CUDA in container"
	@echo "  make shell        - Shell into container"
	@echo "  make rebuild      - Full rebuild and restart"
	@echo "  make test-render  - Test render endpoint"
	@echo "  make metrics      - Get Prometheus metrics"
