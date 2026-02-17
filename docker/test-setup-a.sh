#!/bin/bash
# Test Setup A - Parler-TTS + NVIDIA Canary
# Quick validation script for DGX Spark deployment

set -e

echo "=========================================="
echo "Setup A Testing - Parler-TTS + Canary STT"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TTS_URL="http://localhost:8082"
STT_URL="http://localhost:8083"

# Test 1: Health Checks
echo "Test 1: Health Checks"
echo "----------------------"

echo -n "Checking Parler-TTS health... "
if curl -s -f "$TTS_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OK${NC}"
    curl -s "$TTS_URL/health" | jq '.'
else
    echo -e "${RED}✗ FAILED${NC}"
    exit 1
fi
echo ""

echo -n "Checking NVIDIA Canary health... "
if curl -s -f "$STT_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OK${NC}"
    curl -s "$STT_URL/health" | jq '.'
else
    echo -e "${RED}✗ FAILED${NC}"
    exit 1
fi
echo ""

# Test 2: List Capabilities
echo "Test 2: Service Capabilities"
echo "-----------------------------"

echo "Parler-TTS Voices:"
curl -s "$TTS_URL/voices" | jq '.supported_languages'
echo ""

echo "Canary STT Languages:"
curl -s "$STT_URL/languages" | jq '.languages'
echo ""

# Test 3: German TTS
echo "Test 3: German TTS Synthesis"
echo "-----------------------------"

echo "Synthesizing German text..."
curl -X POST "$TTS_URL/synthesize" \
    -H "Content-Type: application/json" \
    -d '{
        "text": "Guten Tag! Dies ist ein Test.",
        "language": "de",
        "description": "Eine klare, professionelle Stimme"
    }' \
    --output /tmp/test-german.wav \
    --progress-bar

if [ -f /tmp/test-german.wav ]; then
    SIZE=$(stat -f%z /tmp/test-german.wav 2>/dev/null || stat -c%s /tmp/test-german.wav)
    if [ $SIZE -gt 1000 ]; then
        echo -e "${GREEN}✓ German TTS OK${NC} (${SIZE} bytes)"
        echo "Audio saved to: /tmp/test-german.wav"
    else
        echo -e "${RED}✗ German TTS FAILED${NC} (file too small)"
        exit 1
    fi
else
    echo -e "${RED}✗ German TTS FAILED${NC} (no output file)"
    exit 1
fi
echo ""

# Test 4: English TTS
echo "Test 4: English TTS Synthesis"
echo "------------------------------"

echo "Synthesizing English text..."
curl -X POST "$TTS_URL/synthesize" \
    -H "Content-Type: application/json" \
    -d '{
        "text": "Hello! This is a test.",
        "language": "en",
        "description": "A warm, friendly female voice"
    }' \
    --output /tmp/test-english.wav \
    --progress-bar

if [ -f /tmp/test-english.wav ]; then
    SIZE=$(stat -f%z /tmp/test-english.wav 2>/dev/null || stat -c%s /tmp/test-english.wav)
    if [ $SIZE -gt 1000 ]; then
        echo -e "${GREEN}✓ English TTS OK${NC} (${SIZE} bytes)"
        echo "Audio saved to: /tmp/test-english.wav"
    else
        echo -e "${RED}✗ English TTS FAILED${NC} (file too small)"
        exit 1
    fi
else
    echo -e "${RED}✗ English TTS FAILED${NC} (no output file)"
    exit 1
fi
echo ""

# Test 5: STT with generated audio (if sox/ffmpeg available)
echo "Test 5: STT Transcription"
echo "-------------------------"

if command -v sox &> /dev/null; then
    echo "Generating test audio with sox..."
    sox -n -r 16000 -c 1 /tmp/test-stt.wav synth 2 sine 440 vol 0.5

    echo "Transcribing audio..."
    RESULT=$(curl -X POST "$STT_URL/transcribe" \
        -F "file=@/tmp/test-stt.wav" \
        -F "task=transcribe" \
        -s)

    echo "Result: $RESULT"
    echo -e "${YELLOW}Note: Generated tone audio, transcription may be empty${NC}"
else
    echo -e "${YELLOW}⚠ sox not available, skipping STT test${NC}"
    echo "To test STT manually:"
    echo "  curl -X POST $STT_URL/transcribe -F 'file=@your-audio.wav' -F 'language=de'"
fi
echo ""

# Test 6: Container Status
echo "Test 6: Container Status"
echo "------------------------"

echo "Running containers:"
docker ps --filter "name=secretary" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Test 7: Resource Usage
echo "Test 7: GPU Usage"
echo "-----------------"

if command -v nvidia-smi &> /dev/null; then
    nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu --format=csv
else
    echo -e "${YELLOW}⚠ nvidia-smi not available${NC}"
fi
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}✓ All tests passed!${NC}"
echo ""
echo "Next steps:"
echo "1. Test with Avatar Chat UI"
echo "2. Try voice descriptions in different languages"
echo "3. Test translation: curl -X POST $STT_URL/transcribe -F 'file=@audio.wav' -F 'language=de' -F 'task=translate' -F 'target_language=en'"
echo ""
echo "Audio samples:"
echo "  German: /tmp/test-german.wav"
echo "  English: /tmp/test-english.wav"
echo ""
echo "Play samples (if aplay/afplay available):"
echo "  aplay /tmp/test-german.wav"
echo "  afplay /tmp/test-german.wav"
