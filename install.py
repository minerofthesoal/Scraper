#!/usr/bin/env python3
"""
WebScraper Pro - Cross-platform Python Auto Installer.
Works on Linux (Arch, Ubuntu, Fedora, etc.), macOS, and Windows 10/11.

Usage:
    python install.py
    python install.py --global    (skip venv, install globally)
    python install.py --verify    (verify existing installation)
"""

import os
import sys
import subprocess
import platform
import shutil
import zipfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
VERSION = "0.6.3b4"


def colored(text, color):
    colors = {"blue": "\033[94m", "green": "\033[92m", "yellow": "\033[93m", "red": "\033[91m", "bold": "\033[1m", "reset": "\033[0m"}
    if sys.platform == "win32" and not os.environ.get("TERM"):
        return text
    return f"{colors.get(color, '')}{text}{colors['reset']}"


def info(msg):
    print(colored(f"[INFO] {msg}", "blue"))


def ok(msg):
    print(colored(f"[OK] {msg}", "green"))


def warn(msg):
    print(colored(f"[WARN] {msg}", "yellow"))


def err(msg):
    print(colored(f"[ERROR] {msg}", "red"))


def run(cmd, check=False):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        err(f"Command failed: {' '.join(cmd)}")
        if result.stderr:
            print(result.stderr)
    return result


def detect_os():
    system = platform.system().lower()
    if system == "linux":
        if os.path.exists("/etc/arch-release"):
            return "arch"
        elif os.path.exists("/etc/debian_version"):
            return "debian"
        elif os.path.exists("/etc/fedora-release"):
            return "fedora"
        return "linux"
    elif system == "darwin":
        return "macos"
    elif system == "windows":
        return "windows"
    return "unknown"


def install_system_deps(os_type):
    info("Checking system dependencies...")

    deps = {
        "ffmpeg": {
            "arch": "sudo pacman -S ffmpeg",
            "debian": "sudo apt install ffmpeg",
            "fedora": "sudo dnf install ffmpeg",
            "macos": "brew install ffmpeg",
            "windows": "Download from https://ffmpeg.org/download.html",
        },
    }

    for dep, instructions in deps.items():
        if shutil.which(dep):
            ok(f"{dep} found")
        else:
            warn(f"{dep} not found. Audio conversion requires {dep}.")
            hint = instructions.get(os_type, f"Please install {dep} manually.")
            info(f"Install with: {hint}")


def install_cli(use_global=False):
    info("Installing WebScraper Pro CLI...")

    if use_global:
        pip_cmd = [sys.executable, "-m", "pip"]
        python_cmd = sys.executable
    else:
        if sys.platform == "win32":
            venv_dir = Path.home() / ".webscraper-pro" / "venv"
        else:
            venv_dir = Path.home() / ".webscraper-pro" / "venv"

        venv_dir.parent.mkdir(parents=True, exist_ok=True)

        if not venv_dir.exists():
            info(f"Creating virtual environment at {venv_dir}...")
            import venv
            venv.create(str(venv_dir), with_pip=True)

        if sys.platform == "win32":
            pip_cmd = [str(venv_dir / "Scripts" / "pip")]
            python_cmd = str(venv_dir / "Scripts" / "python")
        else:
            pip_cmd = [str(venv_dir / "bin" / "pip")]
            python_cmd = str(venv_dir / "bin" / "python")

    # Install dependencies
    run([*pip_cmd, "install", "--upgrade", "pip", "setuptools", "wheel"])

    cli_dir = SCRIPT_DIR / "cli"
    result = run([*pip_cmd, "install", "-e", str(cli_dir)])

    if result.returncode != 0:
        info("Falling back to direct dependency install...")
        run([*pip_cmd, "install", "click", "rich", "requests", "beautifulsoup4",
             "huggingface-hub", "Pillow", "pydub", "tqdm"], check=True)

    # Create wrapper script
    local_bin = Path.home() / ".local" / "bin"
    local_bin.mkdir(parents=True, exist_ok=True)

    if sys.platform == "win32":
        wrapper = local_bin / "scrape.cmd"
        wrapper.write_text(f'@echo off\n"{python_cmd}" "{cli_dir / "scrape.py"}" %*\n')
    else:
        wrapper = local_bin / "scrape"
        wrapper.write_text(f'#!/bin/bash\n"{python_cmd}" "{cli_dir / "scrape.py"}" "$@"\n')
        wrapper.chmod(0o755)

    ok(f"CLI installed! Wrapper at: {wrapper}")

    if str(local_bin) not in os.environ.get("PATH", ""):
        warn(f"Add {local_bin} to your PATH for the 'scrape' command")


def setup_extension():
    info("Setting up Firefox extension...")

    # Generate icons
    icons_script = SCRIPT_DIR / "extension" / "icons" / "generate_icons.py"
    icon_48 = SCRIPT_DIR / "extension" / "icons" / "icon-48.png"

    if not icon_48.exists():
        info("Generating extension icons...")
        run([sys.executable, str(icons_script)])

    # Package as .xpi
    xpi_path = SCRIPT_DIR / "webscraper-pro.xpi"
    info("Packaging extension as .xpi...")

    ext_dir = SCRIPT_DIR / "extension"
    with zipfile.ZipFile(str(xpi_path), "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(str(ext_dir)):
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            for fname in files:
                if fname.endswith((".py", ".pyc")):
                    continue
                fpath = os.path.join(root, fname)
                arcname = os.path.relpath(fpath, str(ext_dir))
                zf.write(fpath, arcname)

    ok(f"Extension packaged: {xpi_path}")

    print()
    print(colored("To install the Firefox extension:", "yellow"))
    print(f"  1. Open Firefox")
    print(f"  2. Go to: about:debugging#/runtime/this-firefox")
    print(f"  3. Click 'Load Temporary Add-on'")
    print(f"  4. Select: {ext_dir / 'manifest.json'}")
    print()
    print(colored("For permanent installation:", "yellow"))
    print(f"  1. Go to: about:addons")
    print(f"  2. Click the gear icon -> 'Install Add-on From File'")
    print(f"  3. Select: {xpi_path}")
    print()


def verify_installation():
    """Verify that WebScraper Pro is correctly installed."""
    info("Verifying installation...")
    checks = []

    # Check CLI availability
    scrape_path = shutil.which("scrape")
    if scrape_path:
        ok(f"CLI found: {scrape_path}")
        checks.append(True)
    else:
        err("CLI not found in PATH")
        checks.append(False)

    # Check Python dependencies
    deps = ["click", "rich", "requests", "bs4"]
    for dep in deps:
        try:
            __import__(dep)
            ok(f"Module {dep} available")
            checks.append(True)
        except ImportError:
            err(f"Module {dep} not found")
            checks.append(False)

    # Check extension files
    manifest = SCRIPT_DIR / "extension" / "manifest.json"
    if manifest.exists():
        ok(f"Extension manifest found")
        checks.append(True)
    else:
        err("Extension manifest not found")
        checks.append(False)

    # Check icons
    icon = SCRIPT_DIR / "extension" / "icons" / "icon-48.png"
    if icon.exists():
        ok("Extension icons generated")
        checks.append(True)
    else:
        warn("Extension icons not generated (run install to generate)")
        checks.append(False)

    # Check .xpi
    xpi = SCRIPT_DIR / "webscraper-pro.xpi"
    if xpi.exists():
        ok(f"XPI packaged ({xpi.stat().st_size // 1024}KB)")
        checks.append(True)
    else:
        warn("XPI not yet packaged")
        checks.append(False)

    passed = sum(checks)
    total = len(checks)
    print()
    if passed == total:
        ok(f"All {total} checks passed!")
    else:
        warn(f"{passed}/{total} checks passed")

    return all(checks)


def main():
    print()
    print(colored("╔══════════════════════════════════════════════╗", "blue"))
    print(colored("║    WebScraper Pro v0.6.3b4 - Auto Installer  ║", "blue"))
    print(colored("╚══════════════════════════════════════════════╝", "blue"))
    print()

    if "--verify" in sys.argv:
        verify_installation()
        return

    os_type = detect_os()
    info(f"Detected OS: {os_type} ({platform.platform()})")
    info(f"Python: {sys.version}")

    use_global = "--global" in sys.argv

    install_system_deps(os_type)
    install_cli(use_global)
    setup_extension()

    # Post-install verification
    print()
    info("Running post-install verification...")
    verify_installation()

    print()
    print(colored("╔══════════════════════════════════════════════╗", "green"))
    print(colored("║      Installation Complete!                   ║", "green"))
    print(colored("╚══════════════════════════════════════════════╝", "green"))
    print()
    print("Quick start:")
    print("  scrape -h              Show all commands")
    print("  scrape start           Start a scraping session")
    print("  scrape url <URL>       Scrape a URL directly")
    print("  scrape config.upload   Configure HuggingFace")
    print("  scrape status          Check status")
    print("  scrape doctor          Check system health")
    print("  scrape gui.start       Launch the GUI")
    print()
    print("Update:      scrape -U")
    print("Uninstall:   scrape -rmv")
    print()


if __name__ == "__main__":
    main()
