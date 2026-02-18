#!/bin/bash

echo "=========================================="
echo "STT Services Test - Distil-Whisper + Canary-NeMo"
echo "=========================================="
echo ""

# Test 1: Health Checks
echo "Test 1: Health Checks"
echo "----------------------"

echo -n "Checking Distil-Whisper (8083)... "
if curl -sf http://localhost:8083/health > /dev/null; then
    echo -e "\033[0;32m✓ HEALTHY\033[0m"
else
    echo -e "\033[0;31m✗ FAILED\033[0m"
fi

echo -n "Checking Canary-NeMo (8084)... "
if curl -sf http://localhost:8084/health > /dev/null; then
    echo -e "\033[0;32m✓ HEALTHY\033[0m"
else
    echo -e "\033[0;31m✗ FAILED\033[0m"
fi

echo ""

# Test 2: Create test audio (English)
echo "Test 2: Creating test audio samples"
echo "------------------------------------"

# Generate English test audio using espeak-ng
espeak-ng -v en "Hello, this is a test of the speech to text system" -w /tmp/test_en.wav 2>/dev/null
if [ -f /tmp/test_en.wav ]; then
    echo -e "\033[0;32m✓\033[0m Created English test audio"
else
    echo -e "\033[0;31m✗\033[0m Failed to create English audio"
fi

# Generate German test audio
espeak-ng -v de "Hallo, dies ist ein Test des Spracherkennungssystems" -w /tmp/test_de.wav 2>/dev/null
if [ -f /tmp/test_de.wav ]; then
    echo -e "\033[0;32m✓\033[0m Created German test audio"
else
    echo -e "\033[0;31m✗\033[0m Failed to create German audio"
fi

echo ""

# Test 3: Transcribe with Distil-Whisper
echo "Test 3: Distil-Whisper Transcription"
echo "-------------------------------------"

if [ -f /tmp/test_en.wav ]; then
    echo "Testing English transcription..."
    response=$(curl -sf -X POST http://localhost:8083/transcribe \
        -F "file=@/tmp/test_en.wav" \
        -F "language=en")
    
    if [ $? -eq 0 ]; then
        echo "Response: $response"
        echo -e "\033[0;32m✓\033[0m Distil-Whisper EN transcription successful"
    else
        echo -e "\033[0;31m✗\033[0m Distil-Whisper EN transcription failed"
    fi
fi

if [ -f /tmp/test_de.wav ]; then
    echo ""
    echo "Testing German transcription..."
    response=$(curl -sf -X POST http://localhost:8083/transcribe \
        -F "file=@/tmp/test_de.wav" \
        -F "language=de")
    
    if [ $? -eq 0 ]; then
        echo "Response: $response"
        echo -e "\033[0;32m✓\033[0m Distil-Whisper DE transcription successful"
    else
        echo -e "\033[0;31m✗\033[0m Distil-Whisper DE transcription failed"
    fi
fi

echo ""

# Test 4: Transcribe with Canary-NeMo
echo "Test 4: Canary-NeMo Transcription"
echo "----------------------------------"

if [ -f /tmp/test_en.wav ]; then
    echo "Testing English transcription..."
    response=$(curl -sf -X POST http://localhost:8084/transcribe \
        -F "file=@/tmp/test_en.wav" \
        -F "language=en")
    
    if [ $? -eq 0 ]; then
        echo "Response: $response"
        echo -e "\033[0;32m✓\033[0m Canary-NeMo EN transcription successful"
    else
        echo -e "\033[0;31m✗\033[0m Canary-NeMo EN transcription failed"
    fi
fi

if [ -f /tmp/test_de.wav ]; then
    echo ""
    echo "Testing German transcription..."
    response=$(curl -sf -X POST http://localhost:8084/transcribe \
        -F "file=@/tmp/test_de.wav" \
        -F "language=de")
    
    if [ $? -eq 0 ]; then
        echo "Response: $response"
        echo -e "\033[0;32m✓\033[0m Canary-NeMo DE transcription successful"
    else
        echo -e "\033[0;31m✗\033[0m Canary-NeMo DE transcription failed"
    fi
fi

echo ""
echo "=========================================="
echo "Test completed!"
echo "=========================================="
