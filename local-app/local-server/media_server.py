"""Loopback media bridge: optional SD-Turbo inference and local procedural audio.

Image dependencies and weights are loaded only on an image request. The sound
service works with the Python standard library even while model downloads are
unavailable. It never substitutes generated illustrations for missing models.
"""

from __future__ import annotations

import argparse
import array
import base64
import binascii
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import random
import re
import sys
import struct
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = ROOT.parent / "local-models" / "sd-turbo"
DEFAULT_DATA = ROOT / "data" / "generated-media"
CPP_RUNTIME = ROOT.parent / "local-models" / "image-runtime"
MODEL_FILES = (
    "model_index.json", "unet/config.json", "unet/diffusion_pytorch_model.fp16.safetensors",
    "text_encoder/config.json", "text_encoder/model.fp16.safetensors",
    "vae/config.json", "vae/diffusion_pytorch_model.fp16.safetensors",
    "scheduler/scheduler_config.json", "tokenizer/tokenizer_config.json",
)


class MediaError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code = status, code


def sound_category(prompt):
    text = prompt.lower()
    if re.search(r"切|剁|砧板|chop|slice|cutting|knife", text):
        return "chopping"
    if re.search(r"洗|水|煮|沸|water|boil|rinse|pour", text):
        return "water"
    if re.search(r"煎|炒|炸|油|sizzl|fry|fried|saute", text):
        return "sizzling"
    return "kitchen"


def synthesize_sound(prompt, duration=3.0, sample_rate=22050):
    """Produce a bounded PCM WAV; this is signal synthesis, not a neural model."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise MediaError(400, "INVALID_PROMPT", "请填写烹饪音效描述。")
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or not 1 <= duration <= 8:
        raise MediaError(400, "INVALID_DURATION", "本地音效时长支持1至8秒。")
    category = sound_category(prompt)
    seed = int.from_bytes(hashlib.sha256((prompt + str(duration)).encode()).digest()[:8], "big")
    rng = random.Random(seed)
    count = int(sample_rate * duration)
    samples = []
    previous = filtered = crackle = 0.0
    chops = [0.15 + index * 0.38 + rng.uniform(-0.035, 0.035) for index in range(int(duration / 0.38) + 1)]
    for index in range(count):
        second = index / sample_rate
        noise = rng.uniform(-1, 1)
        filtered = 0.88 * filtered + 0.12 * noise
        if category == "sizzling":
            if rng.random() < 0.0018:
                crackle = rng.uniform(0.18, 0.6)
            crackle *= 0.94
            sample = 0.17 * (noise - 0.7 * previous) + crackle * noise
            sample *= 0.82 + 0.18 * math.sin(second * 5.7)
        elif category == "chopping":
            sample = noise * 0.012
            for start in chops:
                elapsed = second - start
                if 0 <= elapsed < 0.14:
                    sample += math.exp(-elapsed * 48) * (0.58 * math.sin(2 * math.pi * 180 * elapsed) + 0.35 * noise * math.exp(-elapsed * 110))
        elif category == "water":
            sample = filtered * (0.8 + 0.15 * math.sin(second * 7.1)) + noise * 0.05
            sample += 0.035 * math.sin(2 * math.pi * (350 * second + 8 * math.sin(second * 19)))
        else:
            sample = filtered * 0.14
            for start in (0.4, 1.2, 2.1):
                elapsed = second - start
                if 0 <= elapsed < 0.5:
                    sample += math.exp(-elapsed * 12) * (0.13 * math.sin(2 * math.pi * 1380 * elapsed) + 0.06 * math.sin(2 * math.pi * 2210 * elapsed))
        previous = noise
        fade = min(1.0, second / 0.025, (duration - second) / 0.05)
        samples.append(sample * max(0, fade))
    peak = max(max(abs(sample) for sample in samples), 1e-6)
    pcm = array.array("h", (int(max(-1.0, min(1.0, sample / peak * 0.75)) * 32767) for sample in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return output.getvalue(), category


class ImageEngine:
    def __init__(self, model_dir=DEFAULT_MODEL, ollama_url="http://127.0.0.1:11434", ollama_model="qwen3-vl:4b"):
        self.model_dir = Path(model_dir).resolve()
        # Media requests must never forward user prompts to a remote service.
        if not re.fullmatch(r"http://(?:127\.0\.0\.1|localhost):\d{1,5}", ollama_url):
            raise ValueError("Ollama地址必须是本机HTTP地址")
        self.ollama_url, self.ollama_model = ollama_url, ollama_model
        self.lock = threading.Lock()
        self.pipeline = self.edit_pipeline = self.torch = None

    def readiness(self):
        missing_packages = [package for package in ("torch", "diffusers", "transformers", "accelerate", "PIL") if importlib.util.find_spec(package) is None]
        missing_files = [filename for filename in MODEL_FILES if not (self.model_dir / filename).is_file()]
        return {"ready": not missing_packages and not missing_files, "missing_packages": missing_packages,
                "missing_model_files": missing_files, "model": "stabilityai/sd-turbo", "native_size": "512x512", "busy": self.lock.locked()}

    def _ollama(self, path, payload, timeout=90):
        request = urllib.request.Request(self.ollama_url + path, data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json"}, method="POST")
        # Bypass configured outbound proxies for this explicitly loopback request.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=timeout) as response:
            return json.load(response)

    def _english_prompt(self, prompt):
        if re.search(r"[\u3400-\u9fff]", prompt):
            try:
                response = self._ollama("/api/chat", {
                    "model": self.ollama_model, "stream": False, "think": False, "keep_alive": 0,
                    "messages": [{"role": "system", "content": "Translate the user's image description into a concise English image generation prompt under 65 words. Preserve the food, style, composition and requested visual details. Return only the English prompt, without explanations, quotes or markup."},
                                 {"role": "user", "content": prompt}],
                    "options": {"temperature": 0.1, "num_predict": 180, "num_ctx": 2048},
                })
                translated = response.get("message", {}).get("content", "").strip()
                if not translated or re.search(r"[\u3400-\u9fff]", translated):
                    raise ValueError("invalid translation")
                return translated
            except (OSError, ValueError, urllib.error.URLError):
                raise MediaError(503, "PROMPT_TRANSLATION_UNAVAILABLE", "中文图片提示词需要本地Qwen翻译服务，请先启动Ollama和qwen3-vl:4b。") from None
        # Unload only this app's configured language model, not unrelated models.
        try:
            self._ollama("/api/generate", {"model": self.ollama_model, "keep_alive": 0}, timeout=10)
        except (OSError, ValueError, urllib.error.URLError):
            pass
        return prompt

    def _load(self):
        if self.pipeline is not None:
            return
        import torch
        from diffusers import AutoPipelineForText2Image, AutoPipelineForImage2Image
        if not torch.cuda.is_available():
            raise MediaError(503, "CUDA_UNAVAILABLE", "图片服务未检测到可用的CUDA显卡，请检查cu130版本PyTorch与NVIDIA驱动。")
        self.torch = torch
        self.pipeline = AutoPipelineForText2Image.from_pretrained(
            str(self.model_dir), torch_dtype=torch.float16, variant="fp16", use_safetensors=True,
            local_files_only=True,
        )
        self.pipeline.set_progress_bar_config(disable=True)
        self.edit_pipeline = AutoPipelineForImage2Image.from_pipe(self.pipeline)
        self.edit_pipeline.set_progress_bar_config(disable=True)

    def generate(self, payload, edit=False):
        prompt = payload.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 4000:
            raise MediaError(400, "INVALID_PROMPT", "图片描述不能为空，且最多4000字符。")
        if payload.get("n", 1) != 1:
            raise MediaError(400, "INVALID_IMAGE_COUNT", "本地图片服务每次生成1张图片。")
        if payload.get("size", "512x512") not in ("512x512", "1024x1024"):
            raise MediaError(400, "INVALID_IMAGE_SIZE", "本地图片服务生成512×512图像。")
        if edit and (not isinstance(payload.get("images"), list) or len(payload["images"]) != 1):
            raise MediaError(400, "INVALID_EDIT_IMAGE", "本地图生图每次需要1张参考图片。")
        readiness = self.readiness()
        if not readiness["ready"]:
            raise MediaError(503, "IMAGE_MODEL_NOT_INSTALLED", "SD-Turbo图片模型或运行环境尚未安装。请运行local-server/install-media.ps1；官方源当前不可达时音效仍可正常使用。")
        if not self.lock.acquire(blocking=False):
            raise MediaError(409, "IMAGE_MODEL_BUSY", "图片模型正在处理另一项请求，请稍后重试。")
        try:
            prompt = self._english_prompt(prompt.strip())
            self._load()
            pipeline = self.edit_pipeline if edit else self.pipeline
            pipeline.to("cuda")
            # CLIP's context is short; truncate tokens explicitly after translation.
            tokens = pipeline.tokenizer(prompt, truncation=True, max_length=pipeline.tokenizer.model_max_length).input_ids
            prompt = pipeline.tokenizer.decode(tokens, skip_special_tokens=True)
            arguments = {"prompt": prompt, "guidance_scale": 0.0, "num_inference_steps": 4}
            if edit:
                from PIL import Image, ImageOps
                raw = payload["images"][0].get("b64_json") if isinstance(payload["images"][0], dict) else None
                if not isinstance(raw, str):
                    raise MediaError(400, "INVALID_EDIT_IMAGE", "参考图需要base64图片数据。")
                try:
                    content = base64.b64decode(raw.split(",", 1)[-1] if raw.startswith("data:") else raw, validate=True)
                    if len(content) > 8 * 1024 * 1024:
                        raise MediaError(413, "IMAGE_TOO_LARGE", "参考图片不能超过8MB。")
                    with Image.open(io.BytesIO(content)) as original:
                        if original.width * original.height > 20_000_000:
                            raise MediaError(413, "IMAGE_TOO_LARGE", "参考图片像素数不能超过2000万。")
                        image = ImageOps.fit(ImageOps.exif_transpose(original).convert("RGB"), (512, 512))
                except (ValueError, binascii.Error, OSError):
                    raise MediaError(400, "INVALID_EDIT_IMAGE", "参考图不是有效图片。") from None
                arguments.update({"image": image, "strength": 0.5})
            else:
                arguments.update({"width": 512, "height": 512})
            with self.torch.inference_mode():
                image = pipeline(**arguments).images[0]
            output = io.BytesIO()
            image.save(output, format="PNG")
            return {"created": int(time.time()), "model": "stabilityai/sd-turbo", "mode": "local-diffusion",
                    "native_size": "512x512", "requested_size": payload.get("size", "512x512"),
                    "data": [{"b64_json": base64.b64encode(output.getvalue()).decode(), "width": 512, "height": 512}]}
        except MediaError:
            raise
        except ImportError:
            raise MediaError(503, "IMAGE_RUNTIME_UNAVAILABLE", "图片模型依赖不完整，请重新运行媒体环境安装脚本。") from None
        except Exception as exc:
            print(f"Image inference failed: {type(exc).__name__}", file=sys.stderr, flush=True)
            raise MediaError(500, "IMAGE_INFERENCE_FAILED", "本地图片生成失败，请检查模型文件和显存，稍后重试。") from None
        finally:
            # Share 12GB VRAM with the app's Ollama model. Keep weights in RAM.
            try:
                if self.pipeline is not None:
                    self.pipeline.to("cpu")
                if self.torch is not None:
                    self.torch.cuda.empty_cache()
            finally:
                self.lock.release()


class CppImageEngine(ImageEngine):
    """SD-Turbo inference through a verified portable Vulkan executable, no PyTorch."""
    def __init__(self, runtime_dir=CPP_RUNTIME, ollama_url="http://127.0.0.1:11434", ollama_model="qwen3-vl:4b-instruct"):
        super().__init__(runtime_dir, ollama_url, ollama_model)
        self.executable = self.model_dir / "bin" / "sd-cli.exe"
        self.weights = self.model_dir / "sd_turbo.safetensors"
        self.backend = os.environ.get("MEDIA_IMAGE_BACKEND", "auto")
        if self.backend == "auto":
            self.backend = self.choose_backend()
        if not re.fullmatch(r"(?:Vulkan|CUDA|CPU)\d*", self.backend):
            raise ValueError("Invalid local image backend")

    def choose_backend(self):
        """Detect this computer's devices rather than assuming a fixed GPU index."""
        if not self.executable.is_file():
            return "CPU"
        try:
            result = subprocess.run([str(self.executable), "--list-devices"],
                                    cwd=self.model_dir, capture_output=True, timeout=30,
                                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            text = (result.stdout + result.stderr).decode("utf-8", errors="replace")
            devices = re.findall(r"^(Vulkan\d+)\s+([^\r\n]+)", text, re.MULTILINE)
            for device, name in devices:
                if re.search(r"NVIDIA|GeForce|Radeon RX|AMD.*Discrete", name, re.IGNORECASE):
                    return device
            if devices:
                return devices[0][0]
        except (OSError, subprocess.TimeoutExpired):
            pass
        return "CPU"

    def readiness(self):
        missing = [p.name for p in (self.executable, self.weights) if not p.is_file()]
        if self.weights.is_file() and self.weights.stat().st_size != 5214561328:
            missing.append("complete sd_turbo.safetensors")
        return {"ready": not missing, "missing_model_files": missing, "missing_packages": [],
                "model": "stabilityai/sd-turbo", "runtime": "stable-diffusion.cpp", "backend": self.backend,
                "native_size": "512x512", "busy": self.lock.locked()}

    def generate(self, payload, edit=False):
        prompt = payload.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 4000:
            raise MediaError(400, "INVALID_PROMPT", "图片描述不能为空，且最多4000字符。")
        if payload.get("n", 1) != 1 or payload.get("size", "512x512") not in ("512x512", "1024x1024"):
            raise MediaError(400, "INVALID_IMAGE_SIZE", "本地图片服务每次生成1张512×512图片。")
        if not self.readiness()["ready"]:
            raise MediaError(503, "IMAGE_MODEL_NOT_INSTALLED", "本地图片模型尚未安装完成。")
        if not self.lock.acquire(blocking=False):
            raise MediaError(409, "IMAGE_MODEL_BUSY", "正在绘制另一张图片，请稍后重试。")
        try:
            prompt = self._english_prompt(prompt.strip())
            with tempfile.TemporaryDirectory(prefix="foodlight-image-") as temp:
                output = Path(temp) / "output.png"
                command = [str(self.executable), "-m", self.weights.name, "--type", "f16", "--backend", self.backend,
                           "--max-vram", "8", "--threads", "8", "--steps", "4", "--cfg-scale", "1",
                           "--sampling-method", "euler_a", "-W", "512", "-H", "512", "-s", "-1",
                           "-p", prompt, "-o", str(output), "--disable-image-metadata"]
                if edit:
                    images = payload.get("images")
                    if not isinstance(images, list) or len(images) != 1 or not isinstance(images[0], dict):
                        raise MediaError(400, "INVALID_EDIT_IMAGE", "本地图生图需要1张参考图片。")
                    raw = images[0].get("b64_json")
                    try:
                        content = base64.b64decode(raw.split(",", 1)[-1] if isinstance(raw, str) else "", validate=True)
                    except (ValueError, binascii.Error):
                        raise MediaError(400, "INVALID_EDIT_IMAGE", "参考图片无效。") from None
                    if not content or len(content) > 8 * 1024 * 1024:
                        raise MediaError(400, "INVALID_EDIT_IMAGE", "参考图片不能为空，且不能超过8MB。")
                    reference = Path(temp) / "reference.img"
                    reference.write_bytes(content)
                    command.extend(["-i", str(reference), "--strength", "0.5"])
                timeout = max(240, int(os.environ.get("MEDIA_IMAGE_TIMEOUT_SECONDS", "240")))
                completed = subprocess.run(command, cwd=self.model_dir, capture_output=True, timeout=timeout,
                                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                if completed.returncode != 0 and self.backend != "CPU":
                    print("GPU image inference failed; retrying with CPU.", file=sys.stderr, flush=True)
                    command[command.index("--backend") + 1] = "CPU"
                    completed = subprocess.run(command, cwd=self.model_dir, capture_output=True, timeout=timeout,
                                               creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                if completed.returncode != 0 or not output.is_file():
                    print(f"SD-Turbo process failed, exit={completed.returncode}", file=sys.stderr, flush=True)
                    raise MediaError(500, "IMAGE_INFERENCE_FAILED", "本地图片生成失败，请检查显卡和模型文件。")
                content = output.read_bytes()
                if content[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", content[16:24]) != (512, 512):
                    raise MediaError(500, "IMAGE_INFERENCE_FAILED", "图片服务没有生成有效的512×512图片。")
                return {"created": int(time.time()), "model": "stabilityai/sd-turbo", "mode": "local-diffusion",
                        "runtime": "stable-diffusion.cpp", "native_size": "512x512", "requested_size": payload.get("size", "512x512"),
                        "data": [{"b64_json": base64.b64encode(content).decode(), "width": 512, "height": 512}]}
        except subprocess.TimeoutExpired:
            raise MediaError(504, "IMAGE_INFERENCE_FAILED", "本地图片生成超时，请稍后重试。") from None
        finally:
            self.lock.release()


class MediaHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, model_dir=DEFAULT_MODEL, data_dir=DEFAULT_DATA, ollama_model="qwen3-vl:4b"):
        engine = CppImageEngine if Path(model_dir).resolve() == DEFAULT_MODEL.resolve() and (CPP_RUNTIME / "bin" / "sd-cli.exe").is_file() else ImageEngine
        self.engine = engine(CPP_RUNTIME if engine is CppImageEngine else model_dir, os.environ.get("MEDIA_OLLAMA_URL", "http://127.0.0.1:11434"), ollama_model)
        self.audio_dir = Path(data_dir).resolve() / "audio"
        self.audio_dir.mkdir(parents=True, exist_ok=True)
        super().__init__(("127.0.0.1", port), MediaHandler)


class MediaHandler(BaseHTTPRequestHandler):
    server_version = "FoodlightLocalMedia/1.0"

    def log_message(self, format_string, *args):
        # Do not log prompts, base64 payloads or account data.
        pass

    def _headers(self, status, content_type="application/json; charset=utf-8", length=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("X-Content-Type-Options", "nosniff")
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.end_headers()

    def _json(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self._headers(status, length=len(data))
        self.wfile.write(data)

    def _local_request(self):
        if not re.fullmatch(r"(?:127\.0\.0\.1|localhost)(?::\d{1,5})?", self.headers.get("Host", "")):
            raise MediaError(403, "LOCAL_ONLY", "媒体服务仅限本机访问。")
        origin = self.headers.get("Origin")
        if origin and not re.fullmatch(r"http://(?:127\.0\.0\.1|localhost)(?::\d{1,5})?", origin):
            raise MediaError(403, "LOCAL_ONLY", "媒体服务仅允许本机应用调用。")

    def do_OPTIONS(self):
        try:
            self._local_request()
            self._headers(204, length=0)
        except MediaError as exc:
            self._json(exc.status, {"code": exc.code, "error": str(exc)})

    def do_GET(self):
        try:
            self._local_request()
            if self.path == "/health":
                return self._json(200, {"ok": True, "images": self.server.engine.readiness(),
                                        "sound": {"ready": True, "mode": "procedural", "neural_model": False}})
            match = re.fullmatch(r"/audio/([a-f0-9]{64})\.wav", self.path)
            if match:
                file = self.server.audio_dir / f"{match[1]}.wav"
                if file.is_file():
                    data = file.read_bytes()
                    self._headers(200, "audio/wav", len(data))
                    return self.wfile.write(data)
            raise MediaError(404, "NOT_FOUND", "文件或接口不存在。")
        except MediaError as exc:
            self._json(exc.status, {"code": exc.code, "error": str(exc)})

    def do_POST(self):
        try:
            self._local_request()
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise MediaError(400, "INVALID_BODY", "无效的请求长度。") from None
            if length < 1 or length > 16 * 1024 * 1024:
                raise MediaError(413, "INVALID_BODY_SIZE", "请求大小无效或超过16MB。")
            try:
                payload = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeDecodeError):
                raise MediaError(400, "INVALID_JSON", "请求不是有效JSON。") from None
            if not isinstance(payload, dict):
                raise MediaError(400, "INVALID_JSON", "请求必须是JSON对象。")
            if self.path == "/v1/audio/sound":
                prompt = payload.get("prompt")
                if not isinstance(prompt, str) or len(prompt) > 4000:
                    raise MediaError(400, "INVALID_PROMPT", "音效描述最多4000字符。")
                duration = payload.get("duration", 3)
                content, category = synthesize_sound(prompt, duration)
                name = hashlib.sha256(content).hexdigest() + ".wav"
                target = self.server.audio_dir / name
                if not target.exists():
                    with tempfile.NamedTemporaryFile(dir=self.server.audio_dir, suffix=".tmp", delete=False) as temporary:
                        temporary.write(content)
                        temporary_path = Path(temporary.name)
                    temporary_path.replace(target)
                url = f"http://127.0.0.1:{self.server.server_port}/audio/{name}"
                return self._json(200, {"mode": "procedural", "model": None, "duration": duration,
                                        "data": [{"url": url, "mode": "procedural", "category": category}]})
            if self.path in ("/v1/images/generations", "/v1/images/edits"):
                return self._json(200, self.server.engine.generate(payload, edit=self.path.endswith("edits")))
            raise MediaError(404, "NOT_FOUND", "接口不存在。")
        except MediaError as exc:
            self._json(exc.status, {"code": exc.code, "error": str(exc), "message": str(exc)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            print(f"Media request failed: {type(exc).__name__}", file=sys.stderr, flush=True)
            self._json(500, {"code": "MEDIA_SERVER_ERROR", "error": "本地媒体处理失败。"})


def main():
    parser = argparse.ArgumentParser(description="食光本地图片及程序音效服务（仅127.0.0.1）")
    parser.add_argument("--port", type=int, default=int(os.environ.get("LOCAL_MEDIA_PORT", "54322")))
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--ollama-model", default=os.environ.get("MEDIA_OLLAMA_MODEL", "qwen3-vl:4b-instruct"))
    args = parser.parse_args()
    server = MediaHTTPServer(args.port, args.model_dir, args.data_dir, args.ollama_model)
    print(f"Local media: http://127.0.0.1:{server.server_port}; sound=procedural; images={'ready' if server.engine.readiness()['ready'] else 'not-installed'}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
