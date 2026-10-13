"""Install the optional image backend exclusively from official package/model hosts."""
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
MODELS = ROOT.parent / "local-models"
MODEL_DIR = MODELS / "sd-turbo"


def main():
    # urllib uses the user's normal OS / HTTP(S)_PROXY settings and validates TLS.
    # Do not consume gigabytes before small official-source requests succeed.
    for label, url in (
        ("PyTorch CUDA index", "https://download.pytorch.org/whl/cu130/torch/"),
        ("Hugging Face SD-Turbo", "https://huggingface.co/stabilityai/sd-turbo/resolve/main/model_index.json"),
        ("PyPI", "https://pypi.org/pypi/diffusers/json"),
    ):
        print(f"Checking {label} ...", flush=True)
        try:
            with urllib.request.urlopen(url, timeout=15) as response:
                response.read(1024)
        except (OSError, urllib.error.URLError):
            raise RuntimeError(f"Cannot reach the official {label} source. No model installation was started. Restore normal network/proxy access and run this script again; TLS verification remains enabled.") from None
    print("Official sources reachable. Expected additional download: approximately 5–7 GB.", flush=True)
    subprocess.run([sys.executable, "-m", "pip", "--isolated", "install", "--disable-pip-version-check", "--cache-dir", str(MODELS / ".pip-cache"), "--index-url",
                    "https://download.pytorch.org/whl/cu130", "torch==2.12.1"], check=True)
    subprocess.run([sys.executable, "-m", "pip", "--isolated", "install", "--disable-pip-version-check", "--cache-dir", str(MODELS / ".pip-cache"), "--index-url",
                    "https://pypi.org/simple", "diffusers>=0.35,<0.37", "transformers>=4.57,<5",
                    "accelerate>=1.10,<2", "safetensors", "Pillow", "numpy"], check=True)
    os.environ.setdefault("HF_HOME", str(MODELS / ".huggingface-cache"))
    from huggingface_hub import snapshot_download
    snapshot_download(
        repo_id="stabilityai/sd-turbo", local_dir=MODEL_DIR,
        allow_patterns=["model_index.json", "LICENSE.md", "README.md", "*/config.json", "scheduler/*", "tokenizer/*", "*/*.fp16.safetensors"],
    )
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("Packages were installed, but CUDA is unavailable. Check the NVIDIA driver and the PyTorch cu130 package.")
    probe = torch.ones((32, 32), device="cuda")
    float((probe @ probe).sum().item())
    from media_server import ImageEngine
    readiness = ImageEngine(MODEL_DIR).readiness()
    if not readiness["ready"]:
        raise RuntimeError("Some FP16 model files or Python dependencies are still missing.")
    (MODEL_DIR / "NOTICE.txt").write_text(
        "Powered by Stability AI\nThis Stability AI Model is licensed under the Stability AI Community License, Copyright © Stability AI Ltd. All Rights Reserved.\nSource: https://huggingface.co/stabilityai/sd-turbo\nSee LICENSE.md for the complete license.\n", encoding="utf-8")
    freeze = subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True)
    (MODELS / "media-requirements-installed.txt").write_text(freeze, encoding="utf-8")
    print(json.dumps({"status": "installed", "device": torch.cuda.get_device_name(0), "cuda": torch.version.cuda,
                      "model": str(MODEL_DIR), "native_size": "512x512"}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr, flush=True)
        sys.exit(1)
