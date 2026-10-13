"""Offline archive creation, long-path extraction, and content verification."""
import hashlib
import json
import os
from pathlib import Path
import sys
import zipfile


def longpath(path):
    absolute = str(Path(path).resolve())
    return "\\\\?\\" + absolute if os.name == "nt" and not absolute.startswith("\\\\?\\") else absolute


def digest(path):
    sha = hashlib.sha256()
    with open(longpath(path), "rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def extract(archive, destination):
    root = Path(destination).resolve()
    with zipfile.ZipFile(longpath(archive)) as source:
        members = source.infolist()
        for index, member in enumerate(members):
            target = (root / member.filename).resolve()
            if not target.is_relative_to(root):
                raise ValueError("Archive path escapes destination")
            os.makedirs(longpath(target if member.is_dir() else target.parent), exist_ok=True)
            if member.is_dir():
                continue
            with source.open(member) as reader, open(longpath(target), "wb") as writer:
                for chunk in iter(lambda: reader.read(8 * 1024 * 1024), b""):
                    writer.write(chunk)
            if (index + 1) % 10000 == 0:
                print(f"Extracted {index + 1}/{len(members)} files", flush=True)


def archive(source, destination, prefix="", file_list=None):
    root = Path(source).resolve()
    with zipfile.ZipFile(longpath(destination), "w", allowZip64=True) as output:
        if file_list is not None:
            entries = json.loads(Path(file_list).read_text(encoding="utf-8"))
            for index, relative in enumerate(entries):
                output.write(longpath(root / relative), relative,
                             compress_type=zipfile.ZIP_DEFLATED, compresslevel=1)
                if (index + 1) % 10000 == 0:
                    print(f"Archived {index + 1}/{len(entries)} dependency files", flush=True)
            return
        manifest_file = root / "PACKAGE-MANIFEST.json"
        if manifest_file.is_file():
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
            entries = [entry["path"] for entry in manifest["files"]] + ["PACKAGE-MANIFEST.json"]
            for index, relative in enumerate(entries):
                file = (root / relative).resolve()
                if not file.is_relative_to(root):
                    raise ValueError("Manifest path escapes package")
                compressed = relative.endswith((".safetensors", ".zip")) or "/blobs/sha256-" in relative
                output.write(longpath(file), prefix + relative,
                             compress_type=zipfile.ZIP_STORED if compressed else zipfile.ZIP_DEFLATED,
                             compresslevel=None if compressed else 1)
                if compressed or (index + 1) % 500 == 0:
                    print(f"Archived {index + 1}/{len(entries)}: {relative}", flush=True)
            return
        for folder, directories, files in os.walk(longpath(root), followlinks=False):
            directories[:] = sorted(d for d in directories if not os.path.islink(os.path.join(folder, d)))
            for name in sorted(files):
                file = Path(folder) / name
                if os.path.islink(file):
                    continue
                relative = os.path.relpath(str(file), longpath(root)).replace("\\", "/")
                compressed = relative.endswith((".safetensors", ".zip")) or "/blobs/sha256-" in relative
                output.write(str(file), prefix + relative,
                             compress_type=zipfile.ZIP_STORED if compressed else zipfile.ZIP_DEFLATED,
                             compresslevel=None if compressed else 1)
                if compressed:
                    print(f"Archived {relative}", flush=True)


def verify(root):
    base = Path(root).resolve()
    manifest = json.loads((base / "PACKAGE-MANIFEST.json").read_text(encoding="utf-8"))
    files = manifest["files"]
    for index, entry in enumerate(files):
        file = base / entry["path"]
        if not file.is_file() or file.stat().st_size != entry["bytes"] or digest(file) != entry["sha256"]:
            raise ValueError(f"Package verification failed: {entry['path']}")
        if (index + 1) % 100 == 0:
            print(f"Verified {index + 1}/{len(files)} files", flush=True)
    print(f"All {len(files)} package files passed SHA256 verification.", flush=True)


def verify_archive(archive):
    with zipfile.ZipFile(longpath(archive)) as source:
        manifests = [m.filename for m in source.infolist()
                     if m.filename.endswith("/PACKAGE-MANIFEST.json") and m.filename.count("/") == 1]
        if len(manifests) != 1:
            raise ValueError("Archive must have one package manifest")
        prefix = manifests[0].rsplit("/", 1)[0] + "/"
        manifest = json.loads(source.read(prefix + "PACKAGE-MANIFEST.json"))
        expected = {entry["path"]: entry for entry in manifest["files"]}
        for index, (relative, entry) in enumerate(expected.items()):
            member = source.getinfo(prefix + relative)
            if member.file_size != entry["bytes"]:
                raise ValueError(f"Archive size mismatch: {relative}")
            sha = hashlib.sha256()
            with source.open(member) as stream:
                for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
                    sha.update(chunk)
            if sha.hexdigest() != entry["sha256"]:
                raise ValueError(f"Archive checksum mismatch: {relative}")
            if (index + 1) % 500 == 0:
                print(f"Archive verified {index + 1}/{len(expected)} files", flush=True)
        actual = {m.filename[len(prefix):] for m in source.infolist() if not m.is_dir()}
        if actual != set(expected) | {"PACKAGE-MANIFEST.json"}:
            raise ValueError("Archive contains unexpected or missing files")
        print(f"Archive CRC and SHA256 checks passed for all {len(expected)} files.", flush=True)


if __name__ == "__main__":
    action = sys.argv[1]
    if action == "extract":
        extract(sys.argv[2], sys.argv[3])
    elif action == "archive":
        archive(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "")
    elif action == "archive-files":
        archive(sys.argv[2], sys.argv[3], file_list=sys.argv[4])
    elif action == "verify":
        verify(sys.argv[2])
    elif action == "verify-archive":
        verify_archive(sys.argv[2])
    else:
        raise ValueError("Unknown action")
