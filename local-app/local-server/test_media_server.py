import array
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import subprocess
import urllib.error
import urllib.request
import wave

from media_server import ImageEngine, CppImageEngine, MediaError, MediaHTTPServer, synthesize_sound


class SoundTests(unittest.TestCase):
    def test_device_selection_tracks_the_target_computer(self):
        with tempfile.TemporaryDirectory(prefix="foodlight-device-test-") as folder:
            binary = Path(folder) / "bin" / "sd-cli.exe"
            binary.parent.mkdir()
            binary.touch()
            for output, expected in [
                (b"Vulkan0\tNVIDIA GeForce RTX 4060\nCPU\tProcessor\n", "Vulkan0"),
                (b"Vulkan0\tIntel Integrated\nVulkan1\tNVIDIA GeForce RTX 5070\nCPU\tProcessor\n", "Vulkan1"),
                (b"CPU\tAMD Ryzen\n", "CPU"),
            ]:
                result = subprocess.CompletedProcess([], 0, stdout=output, stderr=b"")
                with patch("media_server.subprocess.run", return_value=result), patch.dict("os.environ", {"MEDIA_IMAGE_BACKEND": "auto"}):
                    self.assertEqual(CppImageEngine(folder).backend, expected)

    def test_portable_engine_requires_actual_model_files(self):
        with tempfile.TemporaryDirectory(prefix="foodlight-cpp-test-") as folder:
            engine = CppImageEngine(folder)
            self.assertFalse(engine.readiness()["ready"])
            with self.assertRaises(MediaError) as captured:
                engine.generate({"prompt": "a journal illustration"})
            self.assertEqual(captured.exception.code, "IMAGE_MODEL_NOT_INSTALLED")

    def test_real_wav_duration_categories_and_bounded_pcm(self):
        for prompt, expected in [("煎炒鸡蛋", "sizzling"), ("切菜 chopping vegetables", "chopping"), ("冲洗蔬菜的水流", "water"), ("摆盘", "kitchen")]:
            content, category = synthesize_sound(prompt, 3)
            self.assertEqual(category, expected)
            with wave.open(io.BytesIO(content), "rb") as wav:
                self.assertEqual(wav.getnchannels(), 1)
                self.assertEqual(wav.getsampwidth(), 2)
                self.assertEqual(wav.getnframes(), 66150)
                self.assertEqual(wav.getframerate(), 22050)
                pcm = array.array("h", wav.readframes(wav.getnframes()))
                self.assertGreater(max(pcm), 1000)
                self.assertLess(max(abs(sample) for sample in pcm), 32767)
            self.assertEqual(content, synthesize_sound(prompt, 3)[0], "same prompt produces stable cached audio")

    def test_invalid_duration_and_prompt_are_rejected(self):
        for duration in [0, 90, float("nan"), True, "3"]:
            with self.assertRaises(MediaError):
                synthesize_sound("切菜", duration)
        with self.assertRaises(MediaError):
            synthesize_sound("")

    def test_missing_image_model_never_returns_a_fake_image(self):
        with tempfile.TemporaryDirectory(prefix="foodlight-media-model-test-") as folder:
            engine = ImageEngine(folder)
            self.assertFalse(engine.readiness()["ready"])
            with self.assertRaises(MediaError) as captured:
                engine.generate({"prompt": "a plate of vegetables", "size": "1024x1024"})
            self.assertEqual(captured.exception.status, 503)
            self.assertEqual(captured.exception.code, "IMAGE_MODEL_NOT_INSTALLED")
        with self.assertRaises(ValueError):
            ImageEngine(ollama_url="https://external-service.example")


class MediaHTTPTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="foodlight-media-http-test-")
        self.server = MediaHTTPServer(0, model_dir=Path(self.folder.name) / "absent-model", data_dir=self.folder.name)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        self.folder.cleanup()

    def post(self, route, payload, headers=None):
        request = urllib.request.Request(self.url + route, data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json", **(headers or {})})
        return self.opener.open(request, timeout=5)

    def test_sound_http_response_is_playable_local_wav(self):
        with self.post("/v1/audio/sound", {"prompt": "Cooking sound effect: 油锅煎蛋", "duration": 3}) as response:
            result = json.load(response)
        self.assertEqual(result["mode"], "procedural")
        self.assertIsNone(result["model"])
        self.assertTrue(result["data"][0]["url"].startswith(self.url + "/audio/"))
        with self.opener.open(result["data"][0]["url"], timeout=5) as response:
            self.assertEqual(response.headers["Content-Type"], "audio/wav")
            with wave.open(io.BytesIO(response.read()), "rb") as wav:
                self.assertEqual(wav.getnframes() / wav.getframerate(), 3)
        self.assertEqual(len(list((Path(self.folder.name) / "audio").glob("*.wav"))), 1)

    def test_health_and_image_errors_distinguish_available_services(self):
        with self.opener.open(self.url + "/health") as response:
            health = json.load(response)
        self.assertTrue(health["sound"]["ready"])
        self.assertFalse(health["sound"]["neural_model"])
        self.assertFalse(health["images"]["ready"])
        with self.assertRaises(urllib.error.HTTPError) as captured:
            self.post("/v1/images/generations", {"prompt": "vegetable soup"})
        self.assertEqual(captured.exception.code, 503)
        self.assertEqual(json.load(captured.exception)["code"], "IMAGE_MODEL_NOT_INSTALLED")

    def test_remote_origin_invalid_host_and_traversal_are_rejected(self):
        for headers in [{"Origin": "https://external.example"}, {"Host": "external.example"}]:
            with self.assertRaises(urllib.error.HTTPError) as captured:
                self.post("/v1/audio/sound", {"prompt": "切菜"}, headers)
            self.assertEqual(captured.exception.code, 403)
        with self.assertRaises(urllib.error.HTTPError) as captured:
            self.opener.open(self.url + "/audio/../../schema.sql")
        self.assertEqual(captured.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
