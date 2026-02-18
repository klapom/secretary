#!/usr/bin/env python3
"""
Integration Tests for Voice Pipeline
Phase 1: Service Connectivity
Phase 2: STT Testing
Phase 3: TTS Integration
Phase 4: End-to-End Testing
"""

import asyncio
import time
import json
from pathlib import Path
from typing import Dict, List, Optional

import httpx
import numpy as np
import soundfile as sf


class VoicePipelineIntegrationTest:
    """Integration test suite for voice pipeline"""

    def __init__(self, base_url: str = "http://localhost:8765"):
        self.base_url = base_url
        self.results: Dict = {
            "phase1": {},
            "phase2": {},
            "phase3": {},
            "phase4": {},
            "metrics": {},
            "issues": []
        }

    async def run_all_tests(self):
        """Run complete integration test suite"""
        print("=" * 70)
        print("VOICE PIPELINE INTEGRATION TESTS")
        print("=" * 70)

        # Phase 1: Service Connectivity
        await self.phase1_connectivity()

        # Phase 2: STT Testing
        await self.phase2_stt_testing()

        # Phase 3: TTS Integration (edge-tts via main app)
        await self.phase3_tts_integration()

        # Phase 4: End-to-End
        await self.phase4_end_to_end()

        # Generate report
        self.generate_report()

    async def phase1_connectivity(self):
        """Phase 1: Service Connectivity Tests"""
        print("\n" + "=" * 70)
        print("PHASE 1: SERVICE CONNECTIVITY (15 min)")
        print("=" * 70)

        tests = [
            ("Health Endpoint", self.test_health_endpoint),
            ("API Response Format", self.test_api_format),
            ("Error Handling", self.test_error_handling),
            ("Timeout Handling", self.test_timeout)
        ]

        for test_name, test_func in tests:
            try:
                print(f"\n🧪 Testing: {test_name}...")
                result = await test_func()
                self.results["phase1"][test_name] = result
                status = "✅ PASS" if result.get("passed") else "❌ FAIL"
                print(f"{status}: {test_name}")
                if not result.get("passed"):
                    print(f"   Error: {result.get('error')}")
            except Exception as e:
                print(f"❌ FAIL: {test_name} - {str(e)}")
                self.results["phase1"][test_name] = {
                    "passed": False,
                    "error": str(e)
                }
                self.results["issues"].append({
                    "phase": "Phase 1",
                    "test": test_name,
                    "error": str(e)
                })

    async def test_health_endpoint(self) -> Dict:
        """Test /health endpoint"""
        async with httpx.AsyncClient() as client:
            start = time.time()
            response = await client.get(f"{self.base_url}/health")
            latency = time.time() - start

            if response.status_code == 200:
                data = response.json()
                return {
                    "passed": True,
                    "status_code": response.status_code,
                    "latency_ms": latency * 1000,
                    "whisper_loaded": data["models"]["whisper"]["loaded"],
                    "response": data
                }
            else:
                return {
                    "passed": False,
                    "status_code": response.status_code,
                    "error": f"Expected 200, got {response.status_code}"
                }

    async def test_api_format(self) -> Dict:
        """Test API response format"""
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.base_url}/")

            if response.status_code == 200:
                data = response.json()
                required_fields = ["service", "status", "device"]
                has_all = all(field in data for field in required_fields)

                return {
                    "passed": has_all,
                    "response": data,
                    "missing_fields": [f for f in required_fields if f not in data]
                }
            else:
                return {
                    "passed": False,
                    "error": f"Expected 200, got {response.status_code}"
                }

    async def test_error_handling(self) -> Dict:
        """Test error handling for invalid requests"""
        async with httpx.AsyncClient() as client:
            # Test missing file
            response = await client.post(
                f"{self.base_url}/stt/transcribe",
                data={"language": "en"}
            )

            # Should return 422 (validation error) or similar
            if response.status_code in [400, 422]:
                return {
                    "passed": True,
                    "status_code": response.status_code,
                    "message": "Correctly rejects invalid requests"
                }
            else:
                return {
                    "passed": False,
                    "error": f"Expected 4xx error, got {response.status_code}"
                }

    async def test_timeout(self) -> Dict:
        """Test timeout handling"""
        # Test with reasonable timeout
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                response = await client.get(f"{self.base_url}/health")
                return {
                    "passed": response.status_code == 200,
                    "message": "Service responds within timeout"
                }
            except httpx.TimeoutException:
                return {
                    "passed": False,
                    "error": "Service timeout"
                }

    async def phase2_stt_testing(self):
        """Phase 2: STT Testing"""
        print("\n" + "=" * 70)
        print("PHASE 2: STT TESTING (20 min)")
        print("=" * 70)

        tests = [
            ("Basic Transcription", self.test_basic_transcription),
            ("Multi-language Support", self.test_multilanguage),
            ("Latency Measurement", self.test_stt_latency),
            ("Audio Quality Handling", self.test_audio_quality)
        ]

        for test_name, test_func in tests:
            try:
                print(f"\n🧪 Testing: {test_name}...")
                result = await test_func()
                self.results["phase2"][test_name] = result
                status = "✅ PASS" if result.get("passed") else "❌ FAIL"
                print(f"{status}: {test_name}")
                if result.get("metrics"):
                    for key, value in result["metrics"].items():
                        print(f"   📊 {key}: {value}")
            except Exception as e:
                print(f"❌ FAIL: {test_name} - {str(e)}")
                self.results["phase2"][test_name] = {
                    "passed": False,
                    "error": str(e)
                }
                self.results["issues"].append({
                    "phase": "Phase 2",
                    "test": test_name,
                    "error": str(e)
                })

    def create_test_audio(self, duration: float = 3.0, text: str = "test") -> str:
        """Create test audio file"""
        sample_rate = 16000
        t = np.linspace(0, duration, int(sample_rate * duration))

        # Generate 440Hz tone (A note)
        audio = 0.5 * np.sin(2 * np.pi * 440 * t)

        filename = f"test_audio_{text}_{int(time.time())}.wav"
        sf.write(filename, audio, sample_rate)
        return filename

    async def test_basic_transcription(self) -> Dict:
        """Test basic transcription functionality"""
        audio_file = self.create_test_audio(duration=3.0, text="basic")

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                with open(audio_file, "rb") as f:
                    files = {"file": (audio_file, f, "audio/wav")}
                    data = {"language": "en"}

                    start = time.time()
                    response = await client.post(
                        f"{self.base_url}/stt/transcribe",
                        files=files,
                        data=data
                    )
                    latency = time.time() - start

                if response.status_code == 200:
                    result = response.json()
                    return {
                        "passed": True,
                        "metrics": {
                            "latency_ms": f"{latency * 1000:.1f}ms",
                            "confidence": f"{result.get('confidence', 0) * 100:.1f}%",
                            "language": result.get('language', 'unknown')
                        },
                        "transcription": result.get('text', '')
                    }
                else:
                    return {
                        "passed": False,
                        "error": f"Status {response.status_code}: {response.text}"
                    }
        finally:
            Path(audio_file).unlink(missing_ok=True)

    async def test_multilanguage(self) -> Dict:
        """Test multi-language support"""
        languages = ["en", "de", "fr"]
        results = {}

        for lang in languages:
            audio_file = self.create_test_audio(duration=2.0, text=lang)

            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    with open(audio_file, "rb") as f:
                        files = {"file": (audio_file, f, "audio/wav")}
                        data = {"language": lang}

                        response = await client.post(
                            f"{self.base_url}/stt/transcribe",
                            files=files,
                            data=data
                        )

                    if response.status_code == 200:
                        result = response.json()
                        results[lang] = {
                            "success": True,
                            "detected_language": result.get('language')
                        }
                    else:
                        results[lang] = {
                            "success": False,
                            "error": response.status_code
                        }
            finally:
                Path(audio_file).unlink(missing_ok=True)

        all_passed = all(r["success"] for r in results.values())
        return {
            "passed": all_passed,
            "languages_tested": list(results.keys()),
            "results": results
        }

    async def test_stt_latency(self) -> Dict:
        """Test STT latency with various audio lengths"""
        durations = [1.0, 3.0, 5.0]
        latencies = []

        for duration in durations:
            audio_file = self.create_test_audio(duration=duration, text=f"{duration}s")

            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    with open(audio_file, "rb") as f:
                        files = {"file": (audio_file, f, "audio/wav")}

                        start = time.time()
                        response = await client.post(
                            f"{self.base_url}/stt/transcribe",
                            files=files
                        )
                        latency = time.time() - start

                    if response.status_code == 200:
                        latencies.append({
                            "duration": duration,
                            "latency_ms": latency * 1000
                        })
            finally:
                Path(audio_file).unlink(missing_ok=True)

        avg_latency = np.mean([l["latency_ms"] for l in latencies])
        target_latency = 1000  # 1 second target

        meets_target = avg_latency < target_latency
        return {
            "passed": meets_target,
            "metrics": {
                "average_latency_ms": f"{avg_latency:.1f}ms",
                "target_latency_ms": f"{target_latency}ms",
                "meets_target": str(meets_target)
            },
            "measurements": latencies
        }

    async def test_audio_quality(self) -> Dict:
        """Test handling of different audio qualities"""
        sample_rates = [8000, 16000, 44100]
        results = {}

        for sr in sample_rates:
            t = np.linspace(0, 2.0, int(sr * 2.0))
            audio = 0.5 * np.sin(2 * np.pi * 440 * t)
            filename = f"test_audio_{sr}hz.wav"
            sf.write(filename, audio, sr)

            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    with open(filename, "rb") as f:
                        files = {"file": (filename, f, "audio/wav")}
                        response = await client.post(
                            f"{self.base_url}/stt/transcribe",
                            files=files
                        )

                    results[f"{sr}Hz"] = {
                        "success": response.status_code == 200,
                        "status_code": response.status_code
                    }
            finally:
                Path(filename).unlink(missing_ok=True)

        return {
            "passed": all(r["success"] for r in results.values()),
            "sample_rates_tested": list(results.keys()),
            "results": results
        }

    async def phase3_tts_integration(self):
        """Phase 3: TTS Integration"""
        print("\n" + "=" * 70)
        print("PHASE 3: TTS INTEGRATION (20 min)")
        print("=" * 70)

        print("\n📝 Note: XTTS not implemented. Using node-edge-tts (in main app)")
        print("   Verifying TTS endpoint returns expected 501 response...")

        result = await self.test_tts_endpoint()
        self.results["phase3"]["TTS Endpoint"] = result

        status = "✅ PASS" if result.get("passed") else "❌ FAIL"
        print(f"\n{status}: TTS Endpoint Validation")

    async def test_tts_endpoint(self) -> Dict:
        """Test TTS endpoint returns expected 501"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/tts/synthesize",
                json={"text": "test", "language": "en"}
            )

            # Should return 501 (not implemented) as documented
            if response.status_code == 501:
                data = response.json()
                return {
                    "passed": True,
                    "status_code": 501,
                    "message": "Correctly returns 501 - use node-edge-tts",
                    "alternatives": data.get("alternatives", [])
                }
            else:
                return {
                    "passed": False,
                    "error": f"Expected 501, got {response.status_code}"
                }

    async def phase4_end_to_end(self):
        """Phase 4: End-to-End Testing"""
        print("\n" + "=" * 70)
        print("PHASE 4: END-TO-END TESTING (20 min)")
        print("=" * 70)

        result = await self.test_end_to_end_latency()
        self.results["phase4"]["End-to-End Latency"] = result

        status = "✅ PASS" if result.get("passed") else "❌ FAIL"
        print(f"\n{status}: End-to-End Latency Test")

        if result.get("metrics"):
            for key, value in result["metrics"].items():
                print(f"   📊 {key}: {value}")

    async def test_end_to_end_latency(self) -> Dict:
        """Test complete pipeline latency"""
        audio_file = self.create_test_audio(duration=3.0, text="e2e")

        try:
            # Measure STT latency
            async with httpx.AsyncClient(timeout=60.0) as client:
                with open(audio_file, "rb") as f:
                    files = {"file": (audio_file, f, "audio/wav")}

                    start = time.time()
                    response = await client.post(
                        f"{self.base_url}/stt/transcribe",
                        files=files
                    )
                    stt_latency = time.time() - start

                if response.status_code == 200:
                    # Note: TTS would be handled by node-edge-tts in main app
                    # For now, just measure STT component
                    total_latency = stt_latency * 1000
                    target_latency = 200  # 200ms target for STT component

                    meets_target = total_latency < target_latency
                    return {
                        "passed": meets_target,
                        "metrics": {
                            "stt_latency_ms": f"{stt_latency * 1000:.1f}ms",
                            "total_measured_ms": f"{total_latency:.1f}ms",
                            "target_ms": f"{target_latency}ms",
                            "meets_target": str(meets_target)
                        }
                    }
                else:
                    return {
                        "passed": False,
                        "error": f"Status {response.status_code}"
                    }
        finally:
            Path(audio_file).unlink(missing_ok=True)

    def generate_report(self):
        """Generate final test report"""
        print("\n" + "=" * 70)
        print("INTEGRATION TEST REPORT")
        print("=" * 70)

        # Count results
        total_tests = 0
        passed_tests = 0

        for phase, tests in self.results.items():
            if phase not in ["metrics", "issues"]:
                for test_name, result in tests.items():
                    total_tests += 1
                    if result.get("passed"):
                        passed_tests += 1

        print(f"\n📊 Overall Results: {passed_tests}/{total_tests} tests passed")
        print(f"   Pass Rate: {(passed_tests/total_tests*100):.1f}%")

        # Print issues
        if self.results["issues"]:
            print(f"\n❌ Issues Found: {len(self.results['issues'])}")
            for issue in self.results["issues"]:
                print(f"   - {issue['phase']} / {issue['test']}: {issue['error']}")
        else:
            print("\n✅ No issues found!")

        # Save to file
        report_file = "integration_test_results.json"
        with open(report_file, "w") as f:
            json.dump(self.results, f, indent=2)
        print(f"\n💾 Full report saved to: {report_file}")


async def main():
    """Run integration tests"""
    tester = VoicePipelineIntegrationTest()
    await tester.run_all_tests()


if __name__ == "__main__":
    asyncio.run(main())
