#!/usr/bin/env python3
"""
Test script for Voice Pipeline Service
"""

import asyncio
import time
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf


def create_test_audio(duration=5.0, sample_rate=16000, filename="test_audio.wav"):
    """Create a test audio file with a simple tone"""
    t = np.linspace(0, duration, int(sample_rate * duration))
    # 440 Hz sine wave (A note)
    audio = np.sin(2 * np.pi * 440 * t)
    sf.write(filename, audio, sample_rate)
    return filename


async def test_health():
    """Test health endpoint"""
    print("🏥 Testing health endpoint...")
    async with httpx.AsyncClient() as client:
        response = await client.get("http://localhost:8765/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200


async def test_whisper_transcription():
    """Test Whisper transcription"""
    print("\n🎤 Testing Whisper transcription...")

    # Create test audio
    test_file = create_test_audio(duration=3.0)
    print(f"Created test audio: {test_file}")

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Upload and transcribe
        with open(test_file, "rb") as f:
            files = {"file": (test_file, f, "audio/wav")}
            data = {
                "language": "en",
                "include_segments": "true"
            }

            print("Sending transcription request...")
            start = time.time()
            response = await client.post(
                "http://localhost:8765/stt/transcribe",
                files=files,
                data=data
            )
            duration = time.time() - start

            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Transcription successful!")
                print(f"   Text: {result['text']}")
                print(f"   Language: {result['language']}")
                print(f"   Confidence: {result['confidence']:.2f}")
                print(f"   Duration: {duration:.2f}s")
                if result.get('segments'):
                    print(f"   Segments: {len(result['segments'])}")
                return True
            else:
                print(f"❌ Transcription failed: {response.text}")
                return False

    # Cleanup
    Path(test_file).unlink(missing_ok=True)


async def test_tts_synthesize():
    """Test TTS synthesis (should return 501 for now)"""
    print("\n🔊 Testing TTS synthesis...")

    async with httpx.AsyncClient() as client:
        payload = {
            "text": "Hello, this is a test.",
            "language": "en",
            "voice_id": "default"
        }

        response = await client.post(
            "http://localhost:8765/tts/synthesize",
            json=payload
        )

        print(f"Status: {response.status_code}")
        if response.status_code == 501:
            print("✅ Expected 501 - TTS not implemented yet")
            print(f"   Response: {response.json()}")
            return True
        else:
            print(f"Response: {response.json()}")
            return False


async def main():
    """Run all tests"""
    print("=" * 60)
    print("Voice Pipeline Service - Test Suite")
    print("=" * 60)

    tests = [
        ("Health Check", test_health),
        ("Whisper Transcription", test_whisper_transcription),
        ("TTS Synthesis (Placeholder)", test_tts_synthesize),
    ]

    results = []
    for name, test_func in tests:
        try:
            result = await test_func()
            results.append((name, result))
        except Exception as e:
            print(f"❌ {name} failed with exception: {e}")
            results.append((name, False))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")

    passed = sum(1 for _, r in results if r)
    total = len(results)
    print(f"\nPassed: {passed}/{total}")


if __name__ == "__main__":
    asyncio.run(main())
