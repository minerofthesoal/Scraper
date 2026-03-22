#!/usr/bin/env python3
"""
WebScraper Pro CLI - Command-line companion for WebScraper Pro Firefox extension.

Usage:
    scrape <command> [options]

Commands:
    scrape start [DELAY]             - Start scraping (optional delay in seconds)
    scrape stop                      - Stop active scraping session
    scrape status                    - Show current scraping status
    scrape config                    - Show current configuration
    scrape config.set KEY VALUE      - Set a configuration value
    scrape config.upload             - Configure HF upload settings
    scrape config.save               - Configure local save settings
    scrape config.reset              - Reset config to defaults
    scrape export [FORMAT]           - Export scraped data (jsonl/json/csv/xml/md)
    scrape upload                    - Upload data to HuggingFace
    scrape upload.new REPO_ID        - Create new HF repo and upload
    scrape upload.status             - Check upload status
    scrape cite                      - Generate MLA citations for all sources
    scrape cite.export [FILE]        - Export citations to file
    scrape convert.images [FORMAT]   - Convert images to png/webp/jpg
    scrape convert.audio             - Convert audio files to .wav
    scrape stats                     - Show session statistics
    scrape clear                     - Clear all scraped data
    scrape clear.cache               - Clear cache only
    scrape history                   - Show scraping history
    scrape history.search QUERY      - Search scraping history
    scrape serve [PORT]              - Start local web viewer
    scrape merge FILE [FILE...]      - Merge multiple JSONL files
    scrape filter FIELD VALUE        - Filter records by field value
    scrape readme                    - Generate HF README from data
    scrape validate                  - Validate scraped data integrity
    scrape ai.serve [--gpu|--cpu]    - Start NuExtract AI server
    scrape ai.extract TEMPLATE TEXT  - Extract structured data with AI
    scrape ai.status                 - Check AI server status
    scrape ai.setup                  - Download and configure NuExtract model
    scrape images.export [FORMAT]    - Export images in PNG/WebP/BMP/JPEG
    scrape -U                        - Update automatically from GitHub
    scrape -rmv                      - Uninstall WebScraper Pro completely
    scrape -h                        - Show help (alias for --help)
    scrape -C option.upload          - Configure upload (dot-syntax)
    scrape --version                 - Show version
    scrape --help                    - Show this help
    scrape logs [--tail N]           - Show scraping logs
    scrape ping URL                  - Check if a URL is reachable
    scrape reset                     - Factory reset all data and config
    scrape benchmark URL             - Benchmark scraping speed for a URL
    scrape diff URL                  - Compare current page to last scrape
    scrape domains                   - List all scraped domains with counts
    scrape sitemap URL               - Discover URLs from sitemap.xml
    scrape robots URL                - Check robots.txt rules for a URL
    scrape headers URL               - Show HTTP response headers for a URL
    scrape extract.emails            - Extract emails from scraped data
    scrape extract.phones            - Extract phone numbers from scraped data
    scrape count                     - Count records by type
    scrape top [N]                   - Show top N most-scraped domains
    scrape tag FIELD VALUE           - Tag/annotate matching records
    scrape sample [N]                - Show N random records
    scrape summary                   - Generate text summary of scraped data
    scrape env                       - Show environment and config diagnostics
"""

import os
import sys
import json
import time
import glob as glob_mod
import hashlib
import shutil
import http.server
import threading
from datetime import datetime
from pathlib import Path

try:
    import click
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn
    from rich import print as rprint
except ImportError:
    print("Dependencies not installed. Run: pip install click rich requests beautifulsoup4 huggingface-hub Pillow pydub tqdm")
    sys.exit(1)

console = Console()
VERSION = "0.7.2.2"

# ── Config paths ──
def get_config_dir():
    if sys.platform == "win32":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
    else:
        base = os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config"))
    d = os.path.join(base, "webscraper-pro")
    os.makedirs(d, exist_ok=True)
    return d

def get_data_dir():
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
    else:
        base = os.environ.get("XDG_DATA_HOME", os.path.expanduser("~/.local/share"))
    d = os.path.join(base, "webscraper-pro")
    os.makedirs(d, exist_ok=True)
    return d

CONFIG_FILE = os.path.join(get_config_dir(), "config.json")
DATA_DIR = get_data_dir()
HISTORY_FILE = os.path.join(DATA_DIR, "history.jsonl")

OWNER_HF_REPO = "ray0rf1re/Site.scraped"

# ── Python 3.14+ venv fallback for AI commands ──
def _find_compatible_python():
    """Find a compatible Python (3.10-3.13) when running on 3.14+.
    Returns (python_path, version_str) or (None, None) if no compatible python found."""
    # Preferred order: 3.12 first, then 3.13, 3.11, 3.10
    candidates = ["python3.12", "python3.13", "python3.11", "python3.10"]
    for candidate in candidates:
        path = shutil.which(candidate)
        if path:
            try:
                result = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    ver = result.stdout.strip().split()[-1]
                    return path, ver
            except Exception:
                continue
    return None, None


def _ensure_ai_venv():
    """If running Python 3.14+, create a venv with a compatible Python and re-exec.
    Returns True if we should continue, or exits to re-exec in the venv."""
    py_ver = sys.version_info
    if py_ver >= (3, 14):
        venv_dir = os.path.join(os.path.expanduser("~"), ".webscraper-pro-ai-venv")
        venv_python = os.path.join(venv_dir, "bin", "python")

        # If we're already in the venv, continue
        if os.environ.get("WSP_AI_VENV") == "1":
            return True

        # If venv exists and works, re-exec into it
        if os.path.exists(venv_python):
            console.print(f"[yellow]Python {py_ver.major}.{py_ver.minor} detected — using AI venv at {venv_dir}[/yellow]")
            env = os.environ.copy()
            env["WSP_AI_VENV"] = "1"
            os.execve(venv_python, [venv_python] + sys.argv, env)

        # Need to create venv with compatible Python
        console.print(f"[yellow]Python {py_ver.major}.{py_ver.minor} is not supported by PyTorch.[/yellow]")
        console.print("[dim]Searching for Python 3.10-3.13 to create AI venv...[/dim]")

        compat_python, compat_ver = _find_compatible_python()
        if not compat_python:
            console.print("[red]No compatible Python (3.10-3.13) found on system.[/red]")
            console.print("[yellow]Install Python 3.12: sudo apt install python3.12 python3.12-venv[/yellow]")
            return False

        console.print(f"[green]Found {compat_python} ({compat_ver})[/green]")
        console.print(f"[dim]Creating AI venv at {venv_dir}...[/dim]")

        try:
            result = subprocess.run([compat_python, "-m", "venv", venv_dir],
                                    capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                console.print(f"[red]Failed to create venv: {result.stderr}[/red]")
                console.print(f"[yellow]Try: sudo apt install python3.{compat_ver.split('.')[1]}-venv[/yellow]")
                return False

            console.print(f"[green]AI venv created with Python {compat_ver}[/green]")

            # Install the CLI into the venv
            pip_path = os.path.join(venv_dir, "bin", "pip")
            cli_dir = os.path.dirname(os.path.abspath(__file__))
            subprocess.run([pip_path, "install", "-e", cli_dir], capture_output=True, text=True, timeout=120)

            # Re-exec into the venv
            env = os.environ.copy()
            env["WSP_AI_VENV"] = "1"
            os.execve(venv_python, [venv_python] + sys.argv, env)
        except Exception as e:
            console.print(f"[red]Failed to create AI venv: {e}[/red]")
            return False

    return True

DEFAULT_CONFIG = {
    "save_path": os.path.join(DATA_DIR, "scraped"),
    "data_format": "jsonl",
    "hf_token": "",
    "hf_repo_id": "",
    "hf_owner_repo": OWNER_HF_REPO,
    "hf_create_repo": True,
    "hf_private": False,
    "hf_auto_upload": False,
    "upload_to_owner": False,
    "auto_cite": True,
    "image_format": "png",
    "convert_audio_to_wav": True,
    "max_pages": 200,
    "delay_ms": 1500,
    "auto_scroll": True,
    "auto_next": True,
    "user_agent": "WebScraperPro/1.0",
    "respect_robots_txt": True,
    "download_images": False,
    "download_audio": False,
    "proxy": "",
    "timeout": 30,
    "retries": 3,
}


def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            cfg = json.load(f)
        # Merge with defaults for any missing keys
        for k, v in DEFAULT_CONFIG.items():
            cfg.setdefault(k, v)
        return cfg
    return dict(DEFAULT_CONFIG)


def save_config(cfg):
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def log_history(action, details=""):
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    entry = {"timestamp": datetime.now().isoformat(), "action": action, "details": details}
    with open(HISTORY_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")


def get_scraped_files(cfg):
    """Get all JSONL files in the save path."""
    save_path = cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))
    pattern = os.path.join(save_path, "**", "*.jsonl")
    return glob_mod.glob(pattern, recursive=True)


def load_records(cfg):
    """Load all scraped records from JSONL files."""
    records = []
    for fpath in get_scraped_files(cfg):
        with open(fpath, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return records


# ══════════════════════════════════════════
# CLI Commands
# ══════════════════════════════════════════

@click.group(invoke_without_command=True, context_settings=dict(help_option_names=["-h", "--help"]))
@click.option("--version", "-v", is_flag=True, help="Show version")
@click.option("-U", "do_update", is_flag=True, help="Update from GitHub")
@click.option("-rmv", "do_remove", is_flag=True, help="Uninstall WebScraper Pro")
@click.pass_context
def cli(ctx, version, do_update, do_remove):
    """WebScraper Pro CLI - Scraping companion tool."""
    if version:
        console.print(f"[bold blue]WebScraper Pro CLI[/bold blue] v{VERSION}")
        return
    if do_update:
        ctx.invoke(update)
        return
    if do_remove:
        ctx.invoke(uninstall)
        return
    if ctx.invoked_subcommand is None:
        console.print(Panel(
            "[bold blue]WebScraper Pro CLI[/bold blue] v" + VERSION + "\n\n"
            "Use [green]scrape -h[/green] to see all commands.\n"
            "Use [green]scrape <command> -h[/green] for command details.",
            title="WebScraper Pro",
            border_style="blue"
        ))


# ── 1. scrape start ──
@cli.command()
@click.argument("delay", default=0, type=int)
def start(delay):
    """Start a scraping session with optional delay (seconds)."""
    cfg = load_config()
    if delay > 0:
        console.print(f"[yellow]Starting in {delay} seconds...[/yellow]")
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
            task = progress.add_task(f"Waiting {delay}s...", total=delay)
            for i in range(delay):
                time.sleep(1)
                progress.update(task, advance=1, description=f"Starting in {delay - i - 1}s...")

    save_path = cfg["save_path"]
    os.makedirs(save_path, exist_ok=True)

    # Create session file
    session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_file = os.path.join(save_path, f"session_{session_id}.jsonl")

    cfg["active_session"] = session_file
    save_config(cfg)
    log_history("start", f"Session started: {session_file}")

    console.print(f"[green]Scraping session started![/green]")
    console.print(f"  Session file: [cyan]{session_file}[/cyan]")
    console.print(f"  Save path: [cyan]{save_path}[/cyan]")
    console.print(f"  Format: {cfg['data_format']}")
    console.print(f"\nUse the Firefox extension to scrape pages.")
    console.print(f"Use [green]scrape stop[/green] to end the session.")


# ── 2. scrape stop ──
@cli.command()
def stop():
    """Stop the active scraping session."""
    cfg = load_config()
    session = cfg.pop("active_session", None)
    save_config(cfg)
    if session:
        log_history("stop", f"Session stopped: {session}")
        console.print(f"[yellow]Session stopped.[/yellow] Data saved to: [cyan]{session}[/cyan]")
    else:
        console.print("[yellow]No active session.[/yellow]")


# ── 3. scrape status ──
@cli.command()
def status():
    """Show current scraping status."""
    cfg = load_config()
    session = cfg.get("active_session")
    records = load_records(cfg)

    table = Table(title="Scraping Status")
    table.add_column("Field", style="cyan")
    table.add_column("Value", style="white")

    table.add_row("Active Session", session or "None")
    table.add_row("Total Records", str(len(records)))
    table.add_row("Text Records", str(sum(1 for r in records if r.get("type") == "text")))
    table.add_row("Image Records", str(sum(1 for r in records if r.get("type") == "image")))
    table.add_row("Link Records", str(sum(1 for r in records if r.get("type") == "link")))
    table.add_row("Audio Records", str(sum(1 for r in records if r.get("type") == "audio")))
    table.add_row("Data Files", str(len(get_scraped_files(cfg))))
    table.add_row("Save Path", cfg.get("save_path", "N/A"))
    table.add_row("HF Repo", cfg.get("hf_repo_id") or "Not configured")

    console.print(table)


# ── 4. scrape config ──
@cli.command("config")
def show_config():
    """Show current configuration."""
    cfg = load_config()
    table = Table(title="Configuration")
    table.add_column("Key", style="cyan")
    table.add_column("Value", style="white")
    for k, v in sorted(cfg.items()):
        if k == "hf_token" and v:
            v = v[:8] + "..." + v[-4:] if len(v) > 12 else "****"
        table.add_row(k, str(v))
    console.print(table)


# ── 5. scrape config.set ──
@cli.command("config.set")
@click.argument("key")
@click.argument("value")
def config_set(key, value):
    """Set a configuration value."""
    cfg = load_config()
    # Type coercion
    if value.lower() in ("true", "false"):
        value = value.lower() == "true"
    elif value.isdigit():
        value = int(value)

    cfg[key] = value
    save_config(cfg)
    log_history("config.set", f"{key} = {value}")
    console.print(f"[green]Set[/green] {key} = {value}")


# ── 6. scrape config.upload ──
@cli.command("config.upload")
@click.option("--token", "-t", prompt="HuggingFace API token", hide_input=True, help="HF API token")
@click.option("--repo", "-r", prompt="Repo ID (user/dataset)", help="HF repo ID")
@click.option("--private", "-p", is_flag=True, help="Make repo private")
@click.option("--auto-create", is_flag=True, default=True, help="Auto-create repo if missing")
def config_upload(token, repo, private, auto_create):
    """Configure HuggingFace upload settings."""
    cfg = load_config()
    cfg["hf_token"] = token
    cfg["hf_repo_id"] = repo
    cfg["hf_private"] = private
    cfg["hf_create_repo"] = auto_create
    save_config(cfg)
    log_history("config.upload", f"Configured HF upload: {repo}")
    console.print(f"[green]HF upload configured![/green] Repo: {repo}")


# ── 7. scrape config.save ──
@cli.command("config.save")
@click.option("--path", "-p", prompt="Save directory", help="Local save path")
@click.option("--format", "-f", "fmt", type=click.Choice(["jsonl", "json", "csv"]), default="jsonl", help="Data format")
def config_save(path, fmt):
    """Configure local save settings."""
    cfg = load_config()
    path = os.path.expanduser(path)
    cfg["save_path"] = path
    cfg["data_format"] = fmt
    save_config(cfg)
    os.makedirs(path, exist_ok=True)
    log_history("config.save", f"Save path: {path}, format: {fmt}")
    console.print(f"[green]Save settings updated![/green] Path: {path}, Format: {fmt}")


# ── 8. scrape config.reset ──
@cli.command("config.reset")
@click.confirmation_option(prompt="Reset all settings to defaults?")
def config_reset():
    """Reset configuration to defaults."""
    save_config(dict(DEFAULT_CONFIG))
    log_history("config.reset", "Config reset to defaults")
    console.print("[green]Configuration reset to defaults.[/green]")


# ── 9. scrape export ──
@cli.command("export")
@click.argument("format", default="jsonl", type=click.Choice(["jsonl", "json", "csv", "xml", "md", "parquet"]))
@click.option("--output", "-o", default=None, help="Output file path")
@click.option("--pretty", "-p", is_flag=True, help="Pretty-print JSON/JSONL output")
@click.option("--compression", "-c", default="snappy",
              type=click.Choice(["snappy", "gzip", "zstd", "none"]),
              help="Parquet compression (default: snappy)")
def export_data(format, output, pretty, compression):
    """Export scraped data in specified format (JSONL, JSON, CSV, XML, MD, Parquet)."""
    cfg = load_config()
    records = load_records(cfg)

    if not records:
        console.print("[yellow]No data to export.[/yellow]")
        return

    if not output:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ext = "parquet" if format == "parquet" else format
        output = f"export_{timestamp}.{ext}"

    if format == "jsonl":
        with open(output, "w") as f:
            for r in records:
                if pretty:
                    f.write(json.dumps(r, indent=2) + "\n\n")
                else:
                    f.write(json.dumps(r) + "\n")
    elif format == "json":
        with open(output, "w") as f:
            json.dump(records, f, indent=2 if pretty else None)
    elif format == "csv":
        import csv
        if records:
            keys = sorted(set().union(*(r.keys() for r in records)))
            with open(output, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=keys)
                writer.writeheader()
                writer.writerows(records)
    elif format == "xml":
        with open(output, "w") as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n<records>\n')
            for r in records:
                f.write("  <record>\n")
                for k, v in r.items():
                    safe_val = str(v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    f.write(f"    <{k}>{safe_val}</{k}>\n")
                f.write("  </record>\n")
            f.write("</records>\n")
    elif format == "md":
        with open(output, "w") as f:
            f.write(f"# WebScraper Pro Export\n\n")
            f.write(f"**Records:** {len(records)} | **Exported:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n---\n\n")
            for i, r in enumerate(records):
                rtype = r.get("type", "unknown")
                source = r.get("source_url", "")
                f.write(f"## Record {i+1} ({rtype})\n\n")
                if source:
                    f.write(f"**Source:** {source}\n\n")
                if rtype == "text":
                    f.write(r.get("text", r.get("content", "")) + "\n\n")
                elif rtype == "image":
                    f.write(f"![{r.get('alt', 'image')}]({r.get('src', '')})\n\n")
                elif rtype == "link":
                    f.write(f"- [{r.get('text', r.get('href', ''))}]({r.get('href', '')})\n\n")
                elif rtype == "audio":
                    f.write(f"Audio: {r.get('src', '')}\n\n")
                else:
                    for k, v in r.items():
                        if k not in ("type", "source_url", "timestamp", "hash"):
                            f.write(f"- **{k}:** {v}\n")
                    f.write("\n")
                f.write("---\n\n")
    elif format == "parquet":
        try:
            import pyarrow as pa
            import pyarrow.parquet as pq
        except ImportError:
            console.print("[red]pyarrow not installed. Run:[/red] pip install pyarrow")
            return

        # Flatten records: convert nested dicts/lists to JSON strings for parquet
        flat_records = []
        for r in records:
            flat = {}
            for k, v in r.items():
                if isinstance(v, (dict, list)):
                    flat[k] = json.dumps(v, ensure_ascii=False)
                else:
                    flat[k] = v
            flat_records.append(flat)

        # Build table from records
        all_keys = sorted(set().union(*(r.keys() for r in flat_records)))
        columns = {}
        for key in all_keys:
            vals = [r.get(key) for r in flat_records]
            # Determine type from first non-None value
            sample = next((v for v in vals if v is not None), "")
            if isinstance(sample, int):
                columns[key] = pa.array([v if isinstance(v, int) else None for v in vals], type=pa.int64())
            elif isinstance(sample, float):
                columns[key] = pa.array([v if isinstance(v, (int, float)) else None for v in vals], type=pa.float64())
            else:
                columns[key] = pa.array([str(v) if v is not None else None for v in vals], type=pa.string())

        table = pa.table(columns)
        comp = None if compression == "none" else compression
        pq.write_table(table, output, compression=comp)
        file_size = os.path.getsize(output)
        console.print(f"[blue]Parquet: {len(all_keys)} columns, "
                       f"compression={compression}, "
                       f"size={file_size / 1024:.1f} KB[/blue]")

    log_history("export", f"Exported {len(records)} records to {output}")
    console.print(f"[green]Exported {len(records)} records to {output}[/green]")


# ── 10. scrape upload ──
@cli.command("upload")
def upload():
    """Upload data to HuggingFace."""
    cfg = load_config()
    if not cfg.get("hf_token"):
        console.print("[red]HF token not configured.[/red] Run: scrape config.upload")
        return
    if not cfg.get("hf_repo_id"):
        console.print("[red]HF repo not configured.[/red] Run: scrape config.upload")
        return

    try:
        from huggingface_hub import HfApi, create_repo
    except ImportError:
        console.print("[red]huggingface-hub not installed.[/red] Run: pip install huggingface-hub")
        return

    records = load_records(cfg)
    if not records:
        console.print("[yellow]No data to upload.[/yellow]")
        return

    api = HfApi(token=cfg["hf_token"])

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task("Uploading to HuggingFace...", total=None)

        # Create repo if needed
        if cfg.get("hf_create_repo"):
            try:
                create_repo(cfg["hf_repo_id"], repo_type="dataset", private=cfg.get("hf_private", False),
                            token=cfg["hf_token"], exist_ok=True)
                progress.update(task, description="Repo ready...")
            except Exception as e:
                console.print(f"[yellow]Repo creation: {e}[/yellow]")

        # Prepare and upload data
        save_path = cfg["save_path"]
        os.makedirs(save_path, exist_ok=True)

        # Try fetching existing README to preserve version history
        progress.update(task, description="Checking existing README...")
        existing_readme = None
        try:
            import requests as req_lib
            resp = req_lib.get(
                f"https://huggingface.co/{cfg['hf_repo_id']}/raw/main/README.md",
                headers={"Authorization": f"Bearer {cfg['hf_token']}"},
                timeout=10
            )
            if resp.status_code == 200:
                existing_readme = resp.text
        except Exception:
            pass

        # Generate README (preserves old version references if found)
        progress.update(task, description="Generating README...")
        readme = generate_readme_cli(cfg, records)
        # If existing README had a version line, preserve it
        if existing_readme:
            import re as re_mod
            old_match = re_mod.search(
                r'Collected with \[WebScraper Pro\][^\n]*?(v[\d.]+(?:\s+and\s+v[\d.]+)*)',
                existing_readme
            )
            if old_match:
                old_ver = old_match.group(1)
                current_ver = f"v{VERSION}"
                if current_ver not in old_ver:
                    new_ver = f"{old_ver} and {current_ver}"
                else:
                    new_ver = old_ver
                readme = readme.replace(
                    f"v{VERSION}",
                    new_ver,
                    1  # only replace first occurrence (the collection line)
                )
        readme_file = os.path.join(save_path, "README.md")
        with open(readme_file, "w") as f:
            f.write(readme)

        # Write JSONL data
        progress.update(task, description="Writing data...")
        data_file = os.path.join(save_path, "data.jsonl")
        with open(data_file, "w") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

        # Write citations
        citations_file = os.path.join(save_path, "citations.jsonl")
        seen_cite_urls = set()
        with open(citations_file, "w") as f:
            for r in records:
                url = r.get("source_url")
                mla = r.get("citation_mla", "")
                if url and url not in seen_cite_urls and mla:
                    seen_cite_urls.add(url)
                    f.write(json.dumps({"url": url, "mla": mla, "title": r.get("source_title", ""),
                                        "author": r.get("author", "")}) + "\n")

        # Upload (README goes first in the commit)
        progress.update(task, description="Uploading files...")
        api.upload_folder(
            folder_path=save_path,
            repo_id=cfg["hf_repo_id"],
            repo_type="dataset",
            commit_message=f"Update dataset - {len(records)} records from {len(seen_cite_urls)} sources",
        )

        # Also upload to owner repo if configured
        if cfg.get("upload_to_owner"):
            try:
                progress.update(task, description=f"Uploading to owner repo ({OWNER_HF_REPO})...")
                api.upload_folder(
                    folder_path=save_path,
                    repo_id=OWNER_HF_REPO,
                    repo_type="dataset",
                    commit_message=f"Community upload - {len(records)} records",
                )
                console.print(f"[green]Also uploaded to owner repo: {OWNER_HF_REPO}[/green]")
            except Exception as e:
                console.print(f"[yellow]Owner repo upload failed: {e}[/yellow]")

    log_history("upload", f"Uploaded {len(records)} records to {cfg['hf_repo_id']}")
    console.print(f"[green]Uploaded {len(records)} records to {cfg['hf_repo_id']}![/green]")


# ── 11. scrape upload.new ──
@cli.command("upload.new")
@click.argument("repo_id")
@click.option("--private", "-p", is_flag=True, help="Make repo private")
def upload_new(repo_id, private):
    """Create a new HF repo and upload data to it."""
    cfg = load_config()
    if not cfg.get("hf_token"):
        console.print("[red]HF token not configured.[/red] Run: scrape config.upload")
        return

    cfg["hf_repo_id"] = repo_id
    cfg["hf_private"] = private
    cfg["hf_create_repo"] = True
    save_config(cfg)

    # Invoke upload
    from click.testing import CliRunner
    runner = CliRunner()
    result = runner.invoke(upload)
    if result.output:
        console.print(result.output)


# ── 12. scrape upload.status ──
@cli.command("upload.status")
def upload_status():
    """Check HuggingFace upload status."""
    cfg = load_config()
    if not cfg.get("hf_token") or not cfg.get("hf_repo_id"):
        console.print("[yellow]HF not configured.[/yellow]")
        return

    try:
        from huggingface_hub import HfApi
        api = HfApi(token=cfg["hf_token"])
        info = api.dataset_info(cfg["hf_repo_id"])
        console.print(f"[green]Repo:[/green] {info.id}")
        console.print(f"[green]Private:[/green] {info.private}")
        console.print(f"[green]Last Modified:[/green] {info.lastModified}")
        console.print(f"[green]Tags:[/green] {', '.join(info.tags or [])}")
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")


# ── 13. scrape cite ──
@cli.command("cite")
def cite():
    """Generate MLA citations for all scraped sources."""
    cfg = load_config()
    records = load_records(cfg)
    urls = set()
    citations = []

    for r in records:
        url = r.get("source_url")
        if url and url not in urls:
            urls.add(url)
            mla = r.get("citation_mla", "")
            if not mla:
                author = r.get("author", "Unknown")
                title = r.get("source_title", "Untitled")
                site = r.get("site_name", "")
                date_str = r.get("scraped_at", "")
                access_date = datetime.now().strftime("%d %b. %Y")
                mla = f'{author}. "{title}." *{site}*, {url}. Accessed {access_date}.'
            citations.append({"url": url, "mla": mla})

    if not citations:
        console.print("[yellow]No sources to cite.[/yellow]")
        return

    console.print(Panel("[bold]MLA Citations (9th Edition)[/bold]", border_style="blue"))
    for i, c in enumerate(citations, 1):
        console.print(f"  {i}. {c['mla']}\n")

    console.print(f"\n[green]Total sources: {len(citations)}[/green]")


# ── 14. scrape cite.export ──
@cli.command("cite.export")
@click.argument("file", default="citations.txt")
def cite_export(file):
    """Export MLA citations to a file."""
    cfg = load_config()
    records = load_records(cfg)
    urls = set()
    lines = ["MLA Citations (9th Edition)", "=" * 40, ""]

    for r in records:
        url = r.get("source_url")
        if url and url not in urls:
            urls.add(url)
            mla = r.get("citation_mla", "")
            if mla:
                lines.append(mla)
                lines.append("")

    with open(file, "w") as f:
        f.write("\n".join(lines))

    log_history("cite.export", f"Exported {len(urls)} citations to {file}")
    console.print(f"[green]Exported {len(urls)} citations to {file}[/green]")


# ── 15. scrape convert.images ──
@cli.command("convert.images")
@click.argument("format", default="png", type=click.Choice(["png", "webp", "jpg", "jpeg"]))
@click.option("--input-dir", "-i", default=None, help="Input directory with images")
@click.option("--output-dir", "-o", default=None, help="Output directory")
def convert_images(format, input_dir, output_dir):
    """Convert images to specified format (png/webp/jpg)."""
    try:
        from PIL import Image
    except ImportError:
        console.print("[red]Pillow not installed.[/red] Run: pip install Pillow")
        return

    cfg = load_config()
    input_dir = input_dir or os.path.join(cfg["save_path"], "images")
    output_dir = output_dir or os.path.join(cfg["save_path"], "images_converted")
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.exists(input_dir):
        console.print(f"[yellow]No images directory found at {input_dir}[/yellow]")
        return

    converted = 0
    for fname in os.listdir(input_dir):
        fpath = os.path.join(input_dir, fname)
        if not os.path.isfile(fpath):
            continue
        try:
            img = Image.open(fpath)
            out_name = os.path.splitext(fname)[0] + "." + format
            out_path = os.path.join(output_dir, out_name)
            if format in ("jpg", "jpeg"):
                img = img.convert("RGB")
            img.save(out_path)
            converted += 1
        except Exception as e:
            console.print(f"[yellow]Skipped {fname}: {e}[/yellow]")

    log_history("convert.images", f"Converted {converted} images to {format}")
    console.print(f"[green]Converted {converted} images to {format} in {output_dir}[/green]")


# ── 16. scrape convert.audio ──
@cli.command("convert.audio")
@click.option("--input-dir", "-i", default=None, help="Input directory with audio files")
@click.option("--output-dir", "-o", default=None, help="Output directory")
def convert_audio(input_dir, output_dir):
    """Convert audio files to .wav format."""
    try:
        from pydub import AudioSegment
    except ImportError:
        console.print("[red]pydub not installed.[/red] Run: pip install pydub")
        console.print("[yellow]Also ensure ffmpeg is installed on your system.[/yellow]")
        return

    cfg = load_config()
    input_dir = input_dir or os.path.join(cfg["save_path"], "audio")
    output_dir = output_dir or os.path.join(cfg["save_path"], "audio_wav")
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.exists(input_dir):
        console.print(f"[yellow]No audio directory found at {input_dir}[/yellow]")
        return

    converted = 0
    for fname in os.listdir(input_dir):
        fpath = os.path.join(input_dir, fname)
        if not os.path.isfile(fpath):
            continue
        try:
            audio = AudioSegment.from_file(fpath)
            out_name = os.path.splitext(fname)[0] + ".wav"
            out_path = os.path.join(output_dir, out_name)
            audio.export(out_path, format="wav")
            converted += 1
        except Exception as e:
            console.print(f"[yellow]Skipped {fname}: {e}[/yellow]")

    log_history("convert.audio", f"Converted {converted} audio files to .wav")
    console.print(f"[green]Converted {converted} audio files to .wav in {output_dir}[/green]")


# ── 17. scrape stats ──
@cli.command("stats")
def stats():
    """Show detailed session statistics."""
    cfg = load_config()
    records = load_records(cfg)
    files = get_scraped_files(cfg)

    total_size = sum(os.path.getsize(f) for f in files) if files else 0
    urls = set(r.get("source_url", "") for r in records)

    table = Table(title="Session Statistics")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="white")

    table.add_row("Total Records", str(len(records)))
    table.add_row("Text Records", str(sum(1 for r in records if r.get("type") == "text")))
    table.add_row("Image Records", str(sum(1 for r in records if r.get("type") == "image")))
    table.add_row("Link Records", str(sum(1 for r in records if r.get("type") == "link")))
    table.add_row("Audio Records", str(sum(1 for r in records if r.get("type") == "audio")))
    table.add_row("Unique URLs", str(len(urls)))
    table.add_row("Data Files", str(len(files)))
    table.add_row("Total Size", format_bytes(total_size))
    table.add_row("Save Path", cfg.get("save_path", "N/A"))

    console.print(table)


# ── 18. scrape clear ──
@cli.command("clear")
@click.confirmation_option(prompt="Clear all scraped data?")
def clear():
    """Clear all scraped data."""
    cfg = load_config()
    save_path = cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))
    if os.path.exists(save_path):
        shutil.rmtree(save_path)
        os.makedirs(save_path)
    cfg.pop("active_session", None)
    save_config(cfg)
    log_history("clear", "All data cleared")
    console.print("[green]All scraped data cleared.[/green]")


# ── 19. scrape clear.cache ──
@cli.command("clear.cache")
def clear_cache():
    """Clear cache files only."""
    cache_dir = os.path.join(DATA_DIR, "cache")
    if os.path.exists(cache_dir):
        shutil.rmtree(cache_dir)
        os.makedirs(cache_dir)
        console.print("[green]Cache cleared.[/green]")
    else:
        console.print("[yellow]No cache to clear.[/yellow]")


# ── 20. scrape history ──
@cli.command("history")
@click.option("--limit", "-n", default=20, help="Number of entries to show")
def history(limit):
    """Show scraping history."""
    if not os.path.exists(HISTORY_FILE):
        console.print("[yellow]No history yet.[/yellow]")
        return

    entries = []
    with open(HISTORY_FILE, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

    entries = entries[-limit:]

    table = Table(title="Scraping History")
    table.add_column("Time", style="dim")
    table.add_column("Action", style="cyan")
    table.add_column("Details", style="white")

    for e in reversed(entries):
        ts = e.get("timestamp", "?")[:19].replace("T", " ")
        table.add_row(ts, e.get("action", "?"), e.get("details", ""))

    console.print(table)


# ── 21. scrape history.search ──
@cli.command("history.search")
@click.argument("query")
def history_search(query):
    """Search scraping history."""
    if not os.path.exists(HISTORY_FILE):
        console.print("[yellow]No history yet.[/yellow]")
        return

    query_lower = query.lower()
    matches = []
    with open(HISTORY_FILE, "r") as f:
        for line in f:
            if query_lower in line.lower():
                try:
                    matches.append(json.loads(line.strip()))
                except json.JSONDecodeError:
                    pass

    if not matches:
        console.print(f"[yellow]No results for '{query}'.[/yellow]")
        return

    table = Table(title=f"Search Results: '{query}'")
    table.add_column("Time", style="dim")
    table.add_column("Action", style="cyan")
    table.add_column("Details", style="white")

    for e in matches[-20:]:
        ts = e.get("timestamp", "?")[:19].replace("T", " ")
        table.add_row(ts, e.get("action", "?"), e.get("details", ""))

    console.print(table)


# ── 22. scrape serve ──
@cli.command("serve")
@click.argument("port", default=8765, type=int)
def serve(port):
    """Start a local web viewer for scraped data."""
    cfg = load_config()
    save_path = cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))

    if not os.path.exists(save_path):
        console.print(f"[yellow]No data directory at {save_path}[/yellow]")
        return

    handler = lambda *args: http.server.SimpleHTTPRequestHandler(*args, directory=save_path)
    server = http.server.HTTPServer(("localhost", port), handler)

    console.print(f"[green]Serving scraped data at http://localhost:{port}[/green]")
    console.print(f"  Directory: {save_path}")
    console.print(f"  Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
        console.print("\n[yellow]Server stopped.[/yellow]")


# ── 23. scrape merge ──
@cli.command("merge")
@click.argument("files", nargs=-1, required=True)
@click.option("--output", "-o", default="merged.jsonl", help="Output file")
def merge(files, output):
    """Merge multiple JSONL files into one."""
    records = []
    seen_ids = set()

    for fpath in files:
        if not os.path.exists(fpath):
            console.print(f"[yellow]File not found: {fpath}[/yellow]")
            continue
        with open(fpath, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                    rid = rec.get("id", hashlib.md5(line.encode()).hexdigest())
                    if rid not in seen_ids:
                        seen_ids.add(rid)
                        records.append(rec)
                except json.JSONDecodeError:
                    pass

    with open(output, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")

    log_history("merge", f"Merged {len(files)} files -> {output} ({len(records)} records)")
    console.print(f"[green]Merged {len(records)} unique records from {len(files)} files into {output}[/green]")


# ── 24. scrape filter ──
@cli.command("filter")
@click.argument("field")
@click.argument("value")
@click.option("--output", "-o", default=None, help="Output file")
def filter_data(field, value, output):
    """Filter records by field value."""
    cfg = load_config()
    records = load_records(cfg)

    matched = [r for r in records if str(r.get(field, "")).lower() == value.lower()
               or value.lower() in str(r.get(field, "")).lower()]

    if not matched:
        console.print(f"[yellow]No records matching {field}={value}[/yellow]")
        return

    if output:
        with open(output, "w") as f:
            for r in matched:
                f.write(json.dumps(r) + "\n")
        console.print(f"[green]Filtered {len(matched)} records to {output}[/green]")
    else:
        console.print(f"[green]Found {len(matched)} matching records:[/green]")
        for r in matched[:10]:
            rprint(r)
        if len(matched) > 10:
            console.print(f"  ... and {len(matched) - 10} more. Use --output to save all.")


# ── 25. scrape readme ──
@cli.command("readme")
@click.option("--output", "-o", default="README.md", help="Output file")
def readme(output):
    """Generate HuggingFace README from scraped data."""
    cfg = load_config()
    records = load_records(cfg)

    readme_content = generate_readme_cli(cfg, records)
    with open(output, "w") as f:
        f.write(readme_content)

    console.print(f"[green]Generated README at {output}[/green]")


# ── 26. scrape validate ──
@cli.command("validate")
def validate():
    """Validate scraped data integrity."""
    cfg = load_config()
    files = get_scraped_files(cfg)

    if not files:
        console.print("[yellow]No data files found.[/yellow]")
        return

    total_records = 0
    errors = 0
    valid_files = 0

    for fpath in files:
        file_records = 0
        file_errors = 0
        with open(fpath, "r") as f:
            for i, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                    if not isinstance(rec, dict):
                        file_errors += 1
                    else:
                        file_records += 1
                except json.JSONDecodeError:
                    file_errors += 1

        total_records += file_records
        errors += file_errors
        if file_errors == 0:
            valid_files += 1
            console.print(f"  [green]OK[/green] {fpath} ({file_records} records)")
        else:
            console.print(f"  [red]ERRORS[/red] {fpath} ({file_records} valid, {file_errors} errors)")

    console.print(f"\n[bold]Summary:[/bold] {total_records} valid records, {errors} errors across {len(files)} files")
    if errors == 0:
        console.print("[green]All data is valid![/green]")


# ── 27. scrape -U / update ──
@cli.command("update")
def update():
    """Update WebScraper Pro automatically from GitHub."""
    import subprocess
    console.print(f"[blue]Current version: v{VERSION}[/blue]")
    console.print("[blue]Checking for updates from GitHub...[/blue]")

    repo_url = "https://github.com/minerofthesoal/Scraper.git"
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    def run_git(*args, cwd=None):
        return subprocess.run(
            ["git"] + list(args), capture_output=True, text=True,
            cwd=cwd or project_root, timeout=60
        )

    try:
        git_dir = os.path.join(project_root, ".git")
        if os.path.isdir(git_dir):
            # Stash any local changes first
            status = run_git("status", "--porcelain")
            has_changes = bool(status.stdout.strip())
            if has_changes:
                console.print("[yellow]Stashing local changes...[/yellow]")
                run_git("stash", "push", "-m", "wsp-auto-update-stash")

            # Fetch latest from remote
            console.print("[yellow]Fetching from GitHub...[/yellow]")
            fetch = run_git("fetch", "origin")
            if fetch.returncode != 0:
                # Try setting the remote URL in case it's wrong
                run_git("remote", "set-url", "origin", repo_url)
                fetch = run_git("fetch", "origin")
                if fetch.returncode != 0:
                    raise RuntimeError(f"git fetch failed: {fetch.stderr.strip()}")

            # Detect the default branch (main or master)
            branch = None
            for b in ["main", "master"]:
                check = run_git("rev-parse", "--verify", f"origin/{b}")
                if check.returncode == 0:
                    branch = b
                    break

            if not branch:
                raise RuntimeError("Could not find origin/main or origin/master")

            # Reset to the latest remote commit
            console.print(f"[yellow]Updating to latest origin/{branch}...[/yellow]")
            result = run_git("reset", "--hard", f"origin/{branch}")
            if result.returncode != 0:
                raise RuntimeError(f"git reset failed: {result.stderr.strip()}")

            console.print(f"[green]Repository updated to origin/{branch}![/green]")

            # Re-apply stashed changes if any
            if has_changes:
                console.print("[yellow]Re-applying local changes...[/yellow]")
                stash_pop = run_git("stash", "pop")
                if stash_pop.returncode != 0:
                    console.print("[yellow]Could not re-apply local changes (conflict). "
                                  "Your changes are saved in git stash.[/yellow]")

            # Reinstall CLI after update
            console.print("[blue]Reinstalling CLI dependencies...[/blue]")
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-e", script_dir],
                capture_output=True, text=True, timeout=120
            )
            console.print("[green]Update complete! Restart scrape to use the new version.[/green]")
        else:
            # Not in a git repo, try pip install from git
            console.print("[yellow]Not a git checkout. Installing from GitHub...[/yellow]")
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "--upgrade",
                 f"git+{repo_url}#subdirectory=cli"],
                capture_output=True, text=True, timeout=180
            )
            if result.returncode == 0:
                console.print("[green]Updated from GitHub successfully![/green]")
            else:
                console.print(f"[red]Update failed.[/red]\n{result.stderr}")
    except subprocess.TimeoutExpired:
        console.print("[red]Update timed out. Check your network connection.[/red]")
    except Exception as e:
        console.print(f"[red]Update failed: {e}[/red]")


# ── 28. scrape -rmv / uninstall ──
@cli.command("uninstall")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation")
def uninstall(yes):
    """Completely uninstall WebScraper Pro (CLI, config, data, venv)."""
    import subprocess

    config_dir = get_config_dir()
    data_dir = get_data_dir()
    venv_dir = os.path.join(os.path.expanduser("~"), ".webscraper-pro")
    local_bin = os.path.join(os.path.expanduser("~"), ".local", "bin", "scrape")

    console.print("[bold red]WebScraper Pro Uninstaller[/bold red]\n")
    console.print("This will remove:")
    console.print(f"  Config:  [cyan]{config_dir}[/cyan]")
    console.print(f"  Data:    [cyan]{data_dir}[/cyan]")
    console.print(f"  Venv:    [cyan]{venv_dir}[/cyan]")
    console.print(f"  CLI:     [cyan]{local_bin}[/cyan]")

    if not yes:
        click.confirm("\nAre you sure you want to uninstall everything?", abort=True)

    # Uninstall pip package FIRST (before removing venv that contains the python binary)
    try:
        # Try using the current python; if it fails (venv already broken), find system python
        pip_exe = sys.executable
        if not os.path.exists(pip_exe):
            # sys.executable is gone — find a system python
            for candidate in ["python3", "python"]:
                found = shutil.which(candidate)
                if found:
                    pip_exe = found
                    break
        subprocess.run(
            [pip_exe, "-m", "pip", "uninstall", "-y", "webscraper-pro-cli"],
            capture_output=True, text=True, timeout=30
        )
    except Exception:
        pass  # Best-effort; if pip uninstall fails, we still clean up files

    removed = []
    for path in [config_dir, data_dir, venv_dir]:
        if os.path.isdir(path):
            shutil.rmtree(path)
            removed.append(path)

    if os.path.exists(local_bin):
        os.remove(local_bin)
        removed.append(local_bin)
    # Also try .cmd on Windows
    if sys.platform == "win32" and os.path.exists(local_bin + ".cmd"):
        os.remove(local_bin + ".cmd")

    console.print(f"\n[green]Removed {len(removed)} items.[/green]")
    console.print("[green]WebScraper Pro has been uninstalled.[/green]")
    console.print("[dim]To remove the source code, delete the Scraper directory manually.[/dim]")


# ── 29. scrape logs ──
@cli.command("logs")
@click.option("--tail", "-n", "tail_n", default=50, help="Number of log lines to show")
@click.option("--level", "-l", type=click.Choice(["all", "error", "warn", "info"]), default="all", help="Filter by level")
def logs(tail_n, level):
    """Show scraping logs and activity history."""
    log_file = os.path.join(get_data_dir(), "scrape.log")
    history = HISTORY_FILE

    # Collect from history file
    lines = []
    for source in [history, log_file]:
        if os.path.exists(source):
            with open(source, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    if level != "all":
                        try:
                            obj = json.loads(line)
                            action = obj.get("action", "").lower()
                            if level == "error" and "error" not in action and "fail" not in action:
                                continue
                        except json.JSONDecodeError:
                            if level == "error" and "error" not in line.lower():
                                continue
                    lines.append(line)

    if not lines:
        console.print("[yellow]No logs found.[/yellow]")
        return

    # Show last N lines
    for line in lines[-tail_n:]:
        try:
            obj = json.loads(line)
            ts = obj.get("timestamp", "")[:19]
            action = obj.get("action", "unknown")
            detail = obj.get("detail", "")
            color = "red" if "error" in action.lower() or "fail" in action.lower() else "blue"
            console.print(f"  [{color}]{ts}[/{color}]  {action:20s}  {detail}")
        except json.JSONDecodeError:
            console.print(f"  {line}")

    console.print(f"\n[dim]Showing last {min(tail_n, len(lines))} of {len(lines)} entries[/dim]")


# ── 30. scrape ping ──
@cli.command("ping")
@click.argument("url")
@click.option("--count", "-c", default=3, help="Number of pings")
def ping(url, count):
    """Check if a URL is reachable and measure response time."""
    try:
        import requests as req_lib
    except ImportError:
        console.print("[red]requests library required. Run: pip install requests[/red]")
        return

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    console.print(f"[blue]Pinging {url}...[/blue]\n")

    times = []
    for i in range(count):
        try:
            start = time.time()
            resp = req_lib.head(url, timeout=10, allow_redirects=True,
                                headers={"User-Agent": "WebScraperPro/1.0"})
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)

            status_color = "green" if resp.status_code < 400 else "red"
            console.print(f"  [{status_color}]{resp.status_code}[/{status_color}]  {elapsed:.0f}ms  "
                          f"[dim]{resp.headers.get('content-type', 'unknown')}[/dim]")
        except Exception as e:
            console.print(f"  [red]FAIL[/red]  {e}")

    if times:
        avg = sum(times) / len(times)
        console.print(f"\n[bold]Avg:[/bold] {avg:.0f}ms  [bold]Min:[/bold] {min(times):.0f}ms  "
                      f"[bold]Max:[/bold] {max(times):.0f}ms  ({len(times)}/{count} successful)")


# ── 31. scrape reset ──
@cli.command("reset")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation")
def reset(yes):
    """Factory reset - delete all config, data, cache, and history."""
    config_dir = get_config_dir()
    data_dir = get_data_dir()

    console.print("[bold red]Factory Reset[/bold red]\n")
    console.print("This will delete ALL WebScraper Pro data:")
    console.print(f"  Config:  [cyan]{config_dir}[/cyan]")
    console.print(f"  Data:    [cyan]{data_dir}[/cyan]")

    if not yes:
        click.confirm("\nThis cannot be undone. Continue?", abort=True)

    for path in [config_dir, data_dir]:
        if os.path.isdir(path):
            shutil.rmtree(path)
            console.print(f"  [red]Deleted[/red] {path}")

    # Recreate dirs with fresh defaults
    get_config_dir()
    get_data_dir()
    save_config(DEFAULT_CONFIG.copy())

    console.print("\n[green]Factory reset complete. All settings restored to defaults.[/green]")
    log_history("reset", "Factory reset performed")


# ── 32. scrape benchmark ──
@cli.command("benchmark")
@click.argument("url")
@click.option("--rounds", "-r", default=5, help="Number of fetch rounds")
def benchmark(url, rounds):
    """Benchmark scraping speed for a URL (fetch + parse timing)."""
    try:
        import requests as req_lib
        from bs4 import BeautifulSoup
    except ImportError:
        console.print("[red]requests and beautifulsoup4 required.[/red]")
        return

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    console.print(f"[blue]Benchmarking {url} ({rounds} rounds)...[/blue]\n")

    fetch_times = []
    parse_times = []
    sizes = []

    for i in range(rounds):
        try:
            # Fetch
            t0 = time.time()
            resp = req_lib.get(url, timeout=30, headers={"User-Agent": "WebScraperPro/1.0"})
            t_fetch = time.time() - t0

            # Parse
            t1 = time.time()
            soup = BeautifulSoup(resp.text, "html.parser")
            texts = soup.find_all(string=True)
            images = soup.find_all("img")
            links = soup.find_all("a", href=True)
            t_parse = time.time() - t1

            fetch_times.append(t_fetch * 1000)
            parse_times.append(t_parse * 1000)
            sizes.append(len(resp.content))

            console.print(f"  Round {i+1}: fetch={t_fetch*1000:.0f}ms  parse={t_parse*1000:.0f}ms  "
                          f"size={len(resp.content)//1024}KB  "
                          f"[dim]{len(texts)} texts, {len(images)} imgs, {len(links)} links[/dim]")
        except Exception as e:
            console.print(f"  Round {i+1}: [red]FAIL - {e}[/red]")

    if fetch_times:
        console.print(f"\n[bold]Results ({len(fetch_times)}/{rounds} successful):[/bold]")
        table = Table()
        table.add_column("Metric", style="bold")
        table.add_column("Avg")
        table.add_column("Min")
        table.add_column("Max")
        table.add_row("Fetch", f"{sum(fetch_times)/len(fetch_times):.0f}ms",
                       f"{min(fetch_times):.0f}ms", f"{max(fetch_times):.0f}ms")
        table.add_row("Parse", f"{sum(parse_times)/len(parse_times):.0f}ms",
                       f"{min(parse_times):.0f}ms", f"{max(parse_times):.0f}ms")
        table.add_row("Total", f"{(sum(fetch_times)+sum(parse_times))/len(fetch_times):.0f}ms",
                       f"{min(f+p for f,p in zip(fetch_times,parse_times)):.0f}ms",
                       f"{max(f+p for f,p in zip(fetch_times,parse_times)):.0f}ms")
        avg_size = sum(sizes) / len(sizes)
        table.add_row("Page size", f"{avg_size/1024:.0f}KB", "", "")
        console.print(table)


# ── 33. scrape changelog ──
@cli.command("changelog")
def changelog():
    """Show version history and changelog."""
    entries = [
        ("0.7.2.2", "2026-03-21", [
            "Popup: add video stats counter, video data filter, Parquet export option",
            "Popup: add scrapeVideo/allowYouTube/scrapeJS quick toggles",
            "Popup: add AI Screenshot Extract (ASE) section with scroll option",
            "AI extraction: always use local regex fallback when server unavailable (no longer errors when disabled)",
            "AI extraction: improved local regex with URL, topic, sentiment, and description extraction",
            "AI batch extraction: new handler in background script",
            "Video processing: background script now stores video records from scraper",
            "Video export: included in JSONL, JSON, and HuggingFace uploads",
            "Python 3.14+: auto-create venv with Python 3.12 (preferred) or 3.10-3.13 fallback for AI commands",
            "Remove Dependabot configuration",
            "New icon: modern gradient design with document/extraction motif",
            "Improved homepage: redesigned with navigation, export formats, how-it-works steps",
            "Fix version strings: popup, footer, background exports all updated to current version",
        ]),
        ("0.7.2.1", "2026-03-21", [
            "Fix uninstall crash: pip uninstall now runs BEFORE deleting the venv directory",
            "Fix FileNotFoundError when sys.executable points to deleted venv python",
            "Fallback to system python3/python if venv python is missing",
        ]),
        ("0.7.2", "2026-03-21", [
            "Video scraping: extract <video> sources, embeds (Vimeo, Dailymotion, etc.), track subtitles",
            "YouTube filter toggle: YouTube URLs filtered by default, enable in settings",
            "Enhanced JS extraction: shadow DOM, web components, __NEXT_DATA__/__NUXT__, microdata, <template>",
            "GwSS unique composite edge patterns: each connection has a deterministic mixed dash pattern",
            "GwSS engine updated to v0.7.2 with edge pattern cache and improved legend",
            "Queue fix: background tab creation with proper tabs.onUpdated listeners and 45s timeout",
            "HuggingFace upload sharding: auto-split JSONL files at 500KB boundaries",
            "AI extraction: local regex fallback, 'All (Combined)' template, result forwarding to popup",
            "Auto-save: 60s interval persist + 5min session backups",
            "Keyboard shortcuts changed to Ctrl+Shift+key to avoid Firefox conflicts",
            "Sensitive content filter with PII, API key, and custom pattern detection",
            "GitHub Pages homepage at docs/index.html",
            "Updated README with all v0.7.x features",
        ]),
        ("0.6.7", "2026-03-17", [
            "AI setup auto-install: 'scrape ai.setup' now auto-installs PyTorch and transformers (auto-detects GPU)",
            "New AI tab in popup: dedicated tab with server status, results viewer, custom template input",
            "Custom AI templates: paste any JSON schema for custom extraction in both popup and CLI",
            "New templates: job posting and review/rating extraction",
            "Better NuExtract prompt format: improved structured extraction with JSON recovery fallback",
            "New CLI command: 'scrape ai.templates' to list/preview all extraction templates",
            "Popup redesign: updated color scheme, better spacing, glow effects, focus rings, backdrop blur on modals",
            "Download images toggle: new quick setting in popup scrape tab",
            "Popup width increased to 400px for better readability",
        ]),
        ("0.6.6.2", "2026-03-16", [
            "Fix Python detection: try python3/python before versioned names (python3.12, etc.)",
            "Check common absolute paths (/usr/bin, /usr/local/bin, /opt/homebrew/bin) as last resort",
            "Add timeout to Python version check subprocess calls",
            "Remove redundant venv path branch in installer",
            "Fix banner alignment in installer completion message",
        ]),
        ("0.6.6.1", "2026-03-16", [
            "Fix HF upload: use NDJSON commit API with base64 encoding (files now actually upload)",
            "Python 3.13/3.14 support: PyTorch 2.6+ compat, removed 3.12 ceiling",
            "New CLI commands: diff, domains, sitemap, robots, headers, extract.emails, extract.phones",
            "New CLI commands: count, top, tag, sample, summary, env",
            "Improved upload fallback chain: NDJSON -> PUT raw -> POST FormData -> JSON content API",
            "Unicode-safe base64 encoding for non-ASCII scraped content",
            "Updated Uni-S License reference to v3.0 in generated READMEs",
        ]),
        ("0.6.6", "2026-03-16", [
            "Auto XPI build: build_xpi.sh script + scrape build.xpi CLI command",
            "Deobfuscation engine: detect and reverse Base64, hex, charCode, ROT13, CSS-hidden text (disabled by default)",
            "Content sanitizer: XSS detection, URL validation, HTML sanitization for scraped data",
            "Cookie consent auto-dismiss: auto-click cookie banners from CookieBot, OneTrust, etc. (disabled by default)",
            "Tab scraping: scrape all open tabs at once from the popup",
            "Clipboard scrape: scrape content directly from clipboard",
            "Uni-S License v3.0: clearer language, plain-English summaries, anti-abuse clauses, stronger ethics",
            "Security: content sanitization on all scraped data, URL validation, XSS prevention",
            "New settings: deobfuscation toggle, cookie dismiss toggle, tab scraping, clipboard scraping",
        ]),
        ("0.6.5", "2026-03-15", [
            "Fix settings not saving: null-safe element access, error handling on save",
            "Fix HF token validation: credentials:omit prevents cookie leak (always showed logged-in user)",
            "Auto-install Python 3.12: installers now install python3.12 via package manager",
            "All HF API fetch calls use credentials:omit for proper token-based auth",
            "Robust options page: try/catch on save, .catch() on storage calls",
        ]),
        ("0.6.3b4.2", "2026-03-15", [
            "CUDA compute capability 6.1 (Pascal/GTX 1080) support with install guidance",
            "GPU architecture detection: Pascal, Volta, Turing, Ampere, Ada Lovelace, Hopper",
            "Auto-detect GPU/PyTorch compatibility and fall back to CPU if incompatible",
            "Pascal GPUs: recommend PyTorch <=2.4.1 with CUDA 11.8 (sm_61 support)",
            "scrape doctor: show GPU arch, compute capability, CUDA version, compat check",
            "ai.serve: runtime GPU compat check, auto-fallback to CPU on kernel mismatch",
            "ai.setup: per-architecture PyTorch install commands",
            "Health endpoint: report GPU arch, compute capability, CUDA version",
        ]),
        ("0.6.3b4.1", "2026-03-15", [
            "Force Python 3.10-3.12 in all installers (PyTorch compatibility)",
            "Improved PyTorch detection in doctor, ai.serve, ai.setup commands",
            "Show GPU info and CUDA status in scrape doctor",
            "Better error messages when Python version is incompatible",
        ]),
        ("0.6.3b4", "2026-03-15", [
            "Android/Fenix support (Firefox for Android 120+)",
            "Markdown (.md) export format for human-readable output",
            "Pretty-print JSON/JSONL exports (--pretty flag in CLI)",
            "Auto LLM downloading - no separate server needed for AI extraction",
            "New Export tab in popup with format selection and image export",
            "XML export support in CLI",
            "Reorganized popup menu with 5 tabs (Scrape, Queue, Data, Export, Sessions)",
            "AI mode indicator (local vs server) in popup",
        ]),
        ("0.6.3b3", "2026-03-15", [
            "Fix Firefox manifest: numeric-only version (0.6.3.3), valid data_collection_permissions",
            "Fix HuggingFace token validation: whoami-v2 + fallback endpoints for 404 errors",
            "New commands: logs, ping, reset, benchmark, changelog, uninstall",
            "scrape -h for help, -U for auto-update, -rmv for uninstall",
            "Updated installer with post-install verification",
            "Uni-S License v2.1 with expanded protections",
            "Improved GitHub Actions workflows",
        ]),
        ("0.6.3b1", "2026-03-15", [
            "Record detail modal, domain stats, dedup tracking, keyboard nav",
        ]),
        ("0.6.3b", "2026-03-14", [
            "Bug fixes, robustness improvements, code quality overhaul",
        ]),
        ("0.6.2b", "2026-03-13", [
            "Image export, NuExtract AI integration, Firefox validation fix",
        ]),
        ("0.6.1b", "2026-03-12", [
            "Fix WSP_HFUpload undefined error, remove IIFEs from all lib files",
        ]),
        ("0.6b", "2026-03-11", [
            "Major update: smart extract, batch queue, sessions, rate limiting, themes",
        ]),
        ("0.5.5b", "2026-03-10", [
            "Fix HF upload API, add keyboard shortcuts, live preview, dedup",
        ]),
        ("0.5b", "2026-03-09", [
            "Major feature update: GUI, CLI commands, scroll-first scraping, APA citations, Arch pkg",
        ]),
    ]

    console.print(Panel("[bold blue]WebScraper Pro Changelog[/bold blue]", border_style="blue"))
    for ver, date, changes in entries:
        console.print(f"\n[bold green]v{ver}[/bold green]  [dim]{date}[/dim]")
        for change in changes:
            console.print(f"  - {change}")


# ══════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════

def format_bytes(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


# GPU architecture names by compute capability
_GPU_ARCH_NAMES = {
    (3, 5): "Kepler", (3, 7): "Kepler",
    (5, 0): "Maxwell", (5, 2): "Maxwell", (5, 3): "Maxwell",
    (6, 0): "Pascal", (6, 1): "Pascal", (6, 2): "Pascal",
    (7, 0): "Volta", (7, 2): "Volta", (7, 5): "Turing",
    (8, 0): "Ampere", (8, 6): "Ampere", (8, 7): "Ampere", (8, 9): "Ada Lovelace",
    (9, 0): "Hopper",
}

# Recommended PyTorch CUDA index URLs per GPU architecture
_PYTORCH_CUDA_URLS = {
    "Pascal": "https://download.pytorch.org/whl/cu118",      # CUDA 11.8 has best Pascal support
    "Volta": "https://download.pytorch.org/whl/cu121",
    "Turing": "https://download.pytorch.org/whl/cu121",
    "Ampere": "https://download.pytorch.org/whl/cu124",
    "Ada Lovelace": "https://download.pytorch.org/whl/cu124",
    "Hopper": "https://download.pytorch.org/whl/cu124",
}

# Max PyTorch version per arch for cu121/cu124 wheels (cu118 still has sm_61)
_PYTORCH_MAX_VER = {
    # Pascal: cu121/cu124 dropped sm_61 in 2.5+, but cu118 wheels still work.
    # Don't limit version — just ensure cu118 index URL is used for Pascal.
}


def get_gpu_info():
    """Detect GPU details including compute capability and architecture.

    Returns dict with keys: available, name, mem_gb, compute_cap, arch, sm_tag
    or just {available: False} if no CUDA GPU.
    """
    try:
        import torch
    except ImportError:
        return {"available": False, "reason": "pytorch_missing"}

    if not torch.cuda.is_available():
        return {"available": False, "reason": "no_cuda"}

    props = torch.cuda.get_device_properties(0)
    cc = (props.major, props.minor)
    arch = _GPU_ARCH_NAMES.get(cc, f"Unknown (sm_{props.major}{props.minor})")
    return {
        "available": True,
        "name": torch.cuda.get_device_name(0),
        "mem_gb": round(props.total_mem / (1024**3), 1),
        "compute_cap": f"{props.major}.{props.minor}",
        "compute_cap_tuple": cc,
        "arch": arch,
        "sm_tag": f"sm_{props.major}{props.minor}",
        "torch_version": torch.__version__,
        "cuda_version": torch.version.cuda or "unknown",
    }


def check_gpu_pytorch_compat(gpu_info):
    """Check if current PyTorch build supports the detected GPU.

    Returns (ok, message) tuple.
    """
    if not gpu_info.get("available"):
        return False, gpu_info.get("reason", "no_cuda")

    arch = gpu_info["arch"]
    torch_ver = gpu_info["torch_version"].split("+")[0]  # strip +cu121 suffix

    # Check if this architecture has a max supported PyTorch version
    max_ver = _PYTORCH_MAX_VER.get(arch)
    if max_ver:
        from packaging.version import Version
        try:
            if Version(torch_ver) > Version(max_ver):
                return False, (
                    f"PyTorch {torch_ver} may not include {gpu_info['sm_tag']} ({arch}) support in prebuilt wheels. "
                    f"Use PyTorch <={max_ver} or install with CUDA 11.8: "
                    f"pip install torch=={max_ver} --index-url {_PYTORCH_CUDA_URLS.get(arch, _PYTORCH_CUDA_URLS['Pascal'])}"
                )
        except Exception:
            pass  # packaging not available, skip version check

    # Quick runtime check: try a small tensor on GPU
    try:
        import torch
        t = torch.tensor([1.0], device="cuda")
        _ = t + t
        del t
        return True, f"{arch} ({gpu_info['compute_cap']}) - OK"
    except RuntimeError as e:
        err_str = str(e)
        if "no kernel image" in err_str or "CUDA error" in err_str:
            url = _PYTORCH_CUDA_URLS.get(arch, _PYTORCH_CUDA_URLS["Pascal"])
            return False, (
                f"PyTorch was not compiled with {gpu_info['sm_tag']} ({arch}) support. "
                f"Reinstall with: pip install torch --index-url {url}"
            )
        return False, f"CUDA error: {err_str}"


def generate_readme_cli(cfg, records):
    """Generate a comprehensive HF README."""
    repo_name = cfg.get("hf_repo_id", "web-scraped-dataset").split("/")[-1] if cfg.get("hf_repo_id") else "web-scraped-dataset"
    now = datetime.now()

    texts = [r for r in records if r.get("type") == "text"]
    images = [r for r in records if r.get("type") == "image"]
    links = [r for r in records if r.get("type") == "link"]
    audio_recs = [r for r in records if r.get("type") == "audio"]
    urls = set(r.get("source_url", "") for r in records if r.get("source_url"))

    # Size category
    n = len(records)
    if n < 1000:
        size_cat = "n<1K"
    elif n < 10000:
        size_cat = "1K<n<10K"
    elif n < 100000:
        size_cat = "10K<n<100K"
    else:
        size_cat = "100K<n<1M"

    # Collect citations
    citation_lines = []
    seen_urls = set()
    for r in records:
        url = r.get("source_url")
        mla = r.get("citation_mla", "")
        if url and url not in seen_urls and mla:
            seen_urls.add(url)
            citation_lines.append(mla)

    citations_md = ""
    if citation_lines:
        citations_md = "## Sources & Citations (MLA 9th Edition)\n\n"
        for i, c in enumerate(citation_lines, 1):
            citations_md += f"{i}. {c}\n\n"
    else:
        citations_md = "## Sources\n\nNo citations recorded yet.\n"

    return f"""---
license: cc-by-4.0
task_categories:
  - text-generation
  - image-classification
language:
  - en
tags:
  - web-scraping
  - dataset
  - webscraper-pro
pretty_name: {repo_name}
size_categories:
  - {size_cat}
---

# {repo_name}

## Dataset Description

> Collected with [WebScraper Pro](https://github.com/minerofthesoal/Scraper) v{VERSION}

This dataset was collected using [WebScraper Pro](https://github.com/minerofthesoal/Scraper), an open-source Firefox extension and CLI tool for structured web data collection with AI extraction, batch queuing, video scraping, and automatic pagination support.

### Dataset Summary

- **Total Records:** {len(records)}
- **Text Entries:** {len(texts)}
- **Images:** {len(images)}
- **Links:** {len(links)}
- **Audio Files:** {len(audio_recs)}
- **Unique Sources:** {len(urls)}
- **Collection Date:** {now.strftime("%d %b. %Y")}
- **Last Updated:** {now.isoformat()}

### Supported Tasks

- Text generation and analysis
- Image classification and captioning
- Link analysis and web graph construction
- Audio transcription (files converted to .wav)

### Data Format

| File | Format | Description |
|------|--------|-------------|
| `data.jsonl` | JSONL | All scraped records with metadata |
| `images/` | PNG/WebP/JPG | Collected images |
| `audio/` | WAV | Audio files (converted to .wav) |
| `citations.txt` | Text | MLA citation records |

### Data Fields

Each JSONL record contains:

```json
{{
  "id": "unique-record-id",
  "type": "text|image|link|audio",
  "text": "scraped text content (for text type)",
  "src": "media URL (for image/audio type)",
  "href": "link URL (for link type)",
  "source_url": "https://example.com/page",
  "source_title": "Page Title",
  "author": "Original Author",
  "scraped_at": "ISO timestamp",
  "citation_mla": "MLA formatted citation"
}}
```

## Data Collection

Data was collected using WebScraper Pro's area selection and auto-pagination features. All sources are cited below in MLA 9th edition format.

{citations_md}

## Ethical Considerations

- All data was collected from publicly accessible web pages.
- Original authors and sources are cited using MLA 9th edition format.
- This dataset respects `robots.txt` directives where applicable.
- Users of this dataset should verify licensing of individual sources.

## Licensing

This dataset compilation is released under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
Individual content items retain their original licensing from their respective sources.

---

*Generated by [WebScraper Pro](https://github.com/minerofthesoal/Scraper) CLI v{VERSION}*
"""


# ══════════════════════════════════════════
# New Commands (v1.1)
# ══════════════════════════════════════════

# ── 28. scrape gui.start ──
@cli.command("gui.start")
def gui_start():
    """Launch the full graphical user interface."""
    try:
        from gui import launch_gui
        launch_gui()
    except ImportError:
        gui_path = os.path.join(os.path.dirname(__file__), "gui.py")
        if os.path.exists(gui_path):
            import subprocess
            subprocess.run([sys.executable, gui_path])
        else:
            console.print("[red]GUI module not found.[/red]")


# ── 29. scrape install.temp ──
@cli.command("install.temp")
def install_temp():
    """Install the Firefox extension temporarily via about:debugging."""
    import subprocess
    ext_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "extension")
    manifest = os.path.join(ext_dir, "manifest.json")

    if not os.path.exists(manifest):
        console.print(f"[red]manifest.json not found at {ext_dir}[/red]")
        return

    console.print("[blue]Opening Firefox about:debugging...[/blue]")
    console.print(f"\n  1. Click [green]'Load Temporary Add-on'[/green]")
    console.print(f"  2. Navigate to: [cyan]{manifest}[/cyan]")
    console.print(f"  3. Select manifest.json\n")

    # Try to open Firefox debugging page
    import webbrowser
    webbrowser.open("about:debugging#/runtime/this-firefox")

    log_history("install.temp", f"Extension dir: {ext_dir}")
    console.print("[green]Extension directory:[/green] " + ext_dir)
    console.print("[yellow]Note:[/yellow] Temporary extensions are removed when Firefox restarts.")
    console.print("Use [green]scrape install.perm[/green] for permanent installation after building.")


# ── 30. scrape install.perm ──
@cli.command("install.perm")
def install_perm():
    """Install the Firefox extension permanently (from built .xpi)."""
    import webbrowser

    project_root = os.path.dirname(os.path.dirname(__file__))
    xpi_path = os.path.join(project_root, "webscraper-pro.xpi")

    # Try to find or build the .xpi
    if not os.path.exists(xpi_path):
        console.print("[yellow]No .xpi found. Building...[/yellow]")
        _build_xpi(project_root)

    if os.path.exists(xpi_path):
        console.print(f"[green]XPI found:[/green] {xpi_path}")
        console.print(f"\n  [blue]Opening Firefox add-ons page...[/blue]")
        console.print(f"  1. Click the [green]gear icon[/green]")
        console.print(f"  2. Select [green]'Install Add-on From File'[/green]")
        console.print(f"  3. Select: [cyan]{xpi_path}[/cyan]\n")
        webbrowser.open("about:addons")
        log_history("install.perm", f"XPI: {xpi_path}")
    else:
        console.print("[red]Failed to build .xpi[/red]")
        console.print("Run the GitHub Actions build or: python install.py")


@cli.command("build.xpi")
def build_xpi_cmd():
    """Build the Firefox extension .xpi package."""
    project_root = os.path.dirname(os.path.dirname(__file__))
    xpi_path = os.path.join(project_root, "webscraper-pro.xpi")

    # Remove old XPI
    if os.path.exists(xpi_path):
        os.remove(xpi_path)

    _build_xpi(project_root)

    if os.path.exists(xpi_path):
        size = os.path.getsize(xpi_path)
        size_str = f"{size / 1024:.1f} KB" if size < 1048576 else f"{size / 1048576:.1f} MB"
        console.print(f"[green]XPI built successfully:[/green] {xpi_path} ({size_str})")
        log_history("build.xpi", f"Built {xpi_path} ({size_str})")
    else:
        console.print("[red]Failed to build XPI[/red]")


def _build_xpi(project_root):
    """Build the .xpi file from extension directory."""
    import zipfile
    ext_dir = os.path.join(project_root, "extension")
    xpi_path = os.path.join(project_root, "webscraper-pro.xpi")

    if not os.path.exists(ext_dir):
        return

    with zipfile.ZipFile(xpi_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(ext_dir):
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            for fname in files:
                if fname.endswith((".py", ".pyc")):
                    continue
                fpath = os.path.join(root, fname)
                arcname = os.path.relpath(fpath, ext_dir)
                zf.write(fpath, arcname)

    console.print(f"[green]Built:[/green] {xpi_path}")


# ── 31. scrape upload.owner ──
@cli.command("upload.owner")
def upload_owner():
    """Upload data to the extension owner's shared HF dataset (ray0rf1re/Site.scraped)."""
    cfg = load_config()
    if not cfg.get("hf_token"):
        console.print("[red]HF token not configured.[/red] Run: scrape config.upload")
        return

    try:
        from huggingface_hub import HfApi
    except ImportError:
        console.print("[red]huggingface-hub not installed.[/red] Run: pip install huggingface-hub")
        return

    records = load_records(cfg)
    if not records:
        console.print("[yellow]No data to upload.[/yellow]")
        return

    api = HfApi(token=cfg["hf_token"])
    owner_repo = OWNER_HF_REPO

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task(f"Uploading to {owner_repo}...", total=None)

        save_path = cfg["save_path"]
        os.makedirs(save_path, exist_ok=True)

        # Generate and write README first
        progress.update(task, description="Generating README...")
        readme = generate_readme_cli(cfg, records)
        readme_file = os.path.join(save_path, "README.md")
        with open(readme_file, "w") as f:
            f.write(readme)

        # Write data
        progress.update(task, description="Writing data files...")
        data_file = os.path.join(save_path, "data.jsonl")
        with open(data_file, "w") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

        # Write citations
        citations_file = os.path.join(save_path, "citations.jsonl")
        urls_seen = set()
        with open(citations_file, "w") as f:
            for r in records:
                url = r.get("source_url")
                mla = r.get("citation_mla", "")
                if url and url not in urls_seen and mla:
                    urls_seen.add(url)
                    f.write(json.dumps({"url": url, "mla": mla, "title": r.get("source_title", ""),
                                        "author": r.get("author", "")}) + "\n")

        # Upload
        progress.update(task, description=f"Uploading to {owner_repo}...")
        api.upload_folder(
            folder_path=save_path,
            repo_id=owner_repo,
            repo_type="dataset",
            commit_message=f"Community upload - {len(records)} records from {len(urls_seen)} sources",
        )

    log_history("upload.owner", f"Uploaded {len(records)} records to {owner_repo}")
    console.print(f"[green]Uploaded {len(records)} records to {owner_repo}![/green]")


# ── 32. scrape url ──
@cli.command("url")
@click.argument("target_url")
@click.option("--depth", "-d", default=1, help="Crawl depth (1=single page)")
@click.option("--output", "-o", default=None, help="Output file")
@click.option("--images/--no-images", default=True, help="Download images")
def scrape_url(target_url, depth, output, images):
    """Scrape a URL directly from the command line."""
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        console.print("[red]Install: pip install requests beautifulsoup4[/red]")
        return

    cfg = load_config()

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task(f"Scraping {target_url}...", total=None)

        headers = {"User-Agent": cfg.get("user_agent", "WebScraperPro/1.0")}
        try:
            resp = requests.get(target_url, headers=headers, timeout=cfg.get("timeout", 30))
            resp.raise_for_status()
        except Exception as e:
            console.print(f"[red]Request failed:[/red] {e}")
            return

        soup = BeautifulSoup(resp.text, "html.parser")
        records = []
        now_str = datetime.now().isoformat()

        # Page metadata
        title = soup.title.string if soup.title else ""
        author_tag = soup.find("meta", attrs={"name": "author"})
        author = author_tag["content"] if author_tag else "Unknown"
        site_name_tag = soup.find("meta", attrs={"property": "og:site_name"})
        site_name = site_name_tag["content"] if site_name_tag else ""

        # MLA citation
        from urllib.parse import urlparse
        domain = urlparse(target_url).hostname or target_url
        access_date = datetime.now().strftime("%d %b. %Y")
        mla = f'{author}. "{title}." *{site_name or domain}*, {target_url}. Accessed {access_date}.'

        # Extract text
        for tag in soup.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th",
                                   "blockquote", "pre", "code", "figcaption", "dt", "dd"]):
            txt = tag.get_text(strip=True)
            if txt and len(txt) > 5:
                records.append({
                    "id": hashlib.md5(txt.encode()).hexdigest()[:12],
                    "type": "text",
                    "text": txt,
                    "tag": tag.name,
                    "source_url": target_url,
                    "source_title": title,
                    "author": author,
                    "site_name": site_name or domain,
                    "scraped_at": now_str,
                    "citation_mla": mla,
                })

        # Extract images
        for img in soup.find_all("img"):
            src = img.get("src", "")
            if src:
                if src.startswith("/"):
                    src = f"{urlparse(target_url).scheme}://{domain}{src}"
                records.append({
                    "id": hashlib.md5(src.encode()).hexdigest()[:12],
                    "type": "image",
                    "src": src,
                    "alt": img.get("alt", ""),
                    "source_url": target_url,
                    "source_title": title,
                    "author": author,
                    "scraped_at": now_str,
                    "citation_mla": mla,
                })

        # Extract links
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("/"):
                href = f"{urlparse(target_url).scheme}://{domain}{href}"
            if href.startswith("http"):
                records.append({
                    "id": hashlib.md5(href.encode()).hexdigest()[:12],
                    "type": "link",
                    "href": href,
                    "text": a.get_text(strip=True),
                    "source_url": target_url,
                    "scraped_at": now_str,
                })

        # Extract audio
        for audio in soup.find_all(["audio", "video"]):
            src = audio.get("src") or ""
            source_tag = audio.find("source")
            if not src and source_tag:
                src = source_tag.get("src", "")
            if src:
                records.append({
                    "id": hashlib.md5(src.encode()).hexdigest()[:12],
                    "type": "audio",
                    "src": src,
                    "media_type": audio.name,
                    "source_url": target_url,
                    "scraped_at": now_str,
                    "citation_mla": mla,
                })

        progress.update(task, description="Saving...")

    # Save
    if not output:
        save_path = cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))
        os.makedirs(save_path, exist_ok=True)
        safe_domain = domain.replace(".", "_")
        output = os.path.join(save_path, f"url_{safe_domain}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl")

    with open(output, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")

    texts = sum(1 for r in records if r["type"] == "text")
    imgs = sum(1 for r in records if r["type"] == "image")
    lnks = sum(1 for r in records if r["type"] == "link")

    log_history("url", f"Scraped {target_url}: {len(records)} records")
    console.print(f"[green]Scraped {target_url}[/green]")
    console.print(f"  Texts: {texts} | Images: {imgs} | Links: {lnks}")
    console.print(f"  Saved to: [cyan]{output}[/cyan]")


# ── 33. scrape watch ──
@cli.command("watch")
@click.argument("target_url")
@click.option("--interval", "-i", default=60, help="Check interval in seconds")
@click.option("--max-checks", "-n", default=0, help="Max checks (0=infinite)")
def watch(target_url, interval, max_checks):
    """Watch a URL for changes and scrape new content."""
    import requests
    console.print(f"[blue]Watching {target_url} every {interval}s...[/blue]")
    console.print(f"Press Ctrl+C to stop.\n")

    last_hash = None
    checks = 0

    try:
        while max_checks == 0 or checks < max_checks:
            checks += 1
            try:
                resp = requests.get(target_url, timeout=30)
                content_hash = hashlib.md5(resp.text.encode()).hexdigest()

                if last_hash is None:
                    last_hash = content_hash
                    console.print(f"  [{datetime.now().strftime('%H:%M:%S')}] Initial snapshot taken")
                elif content_hash != last_hash:
                    last_hash = content_hash
                    console.print(f"  [{datetime.now().strftime('%H:%M:%S')}] [green]CHANGE DETECTED![/green] Scraping...")
                    # Trigger scrape
                    from click.testing import CliRunner
                    runner = CliRunner()
                    runner.invoke(scrape_url, [target_url])
                else:
                    console.print(f"  [{datetime.now().strftime('%H:%M:%S')}] No changes")

                time.sleep(interval)
            except KeyboardInterrupt:
                raise
            except Exception as e:
                console.print(f"  [{datetime.now().strftime('%H:%M:%S')}] [red]Error: {e}[/red]")
                time.sleep(interval)
    except KeyboardInterrupt:
        console.print(f"\n[yellow]Stopped watching after {checks} checks.[/yellow]")


# ── 34. scrape download.images ──
@cli.command("download.images")
@click.option("--output-dir", "-o", default=None, help="Output directory")
@click.option("--format", "-f", "fmt", default="png", type=click.Choice(["png", "webp", "jpg", "original"]))
def download_images(output_dir, fmt):
    """Download all scraped images to local disk."""
    import requests

    cfg = load_config()
    records = load_records(cfg)
    images = [r for r in records if r.get("type") == "image" and r.get("src")]

    if not images:
        console.print("[yellow]No images to download.[/yellow]")
        return

    output_dir = output_dir or os.path.join(cfg["save_path"], "images")
    os.makedirs(output_dir, exist_ok=True)

    downloaded = 0
    errors = 0

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task(f"Downloading {len(images)} images...", total=len(images))

        for img in images:
            try:
                resp = requests.get(img["src"], timeout=30)
                resp.raise_for_status()

                ext = fmt if fmt != "original" else img["src"].rsplit(".", 1)[-1][:4]
                fname = f"{img['id']}.{ext}"
                fpath = os.path.join(output_dir, fname)

                if fmt != "original" and fmt != ext:
                    try:
                        from PIL import Image
                        from io import BytesIO
                        pil_img = Image.open(BytesIO(resp.content))
                        if fmt in ("jpg", "jpeg"):
                            pil_img = pil_img.convert("RGB")
                        pil_img.save(fpath)
                    except ImportError:
                        with open(fpath, "wb") as f:
                            f.write(resp.content)
                else:
                    with open(fpath, "wb") as f:
                        f.write(resp.content)

                downloaded += 1
            except Exception:
                errors += 1

            progress.update(task, advance=1)

    log_history("download.images", f"Downloaded {downloaded} images, {errors} errors")
    console.print(f"[green]Downloaded {downloaded} images[/green] ({errors} errors) to {output_dir}")


# ── 35. scrape download.audio ──
@cli.command("download.audio")
@click.option("--output-dir", "-o", default=None, help="Output directory")
@click.option("--convert-wav/--no-convert", default=True, help="Convert to .wav")
def download_audio(output_dir, convert_wav):
    """Download all scraped audio files to local disk."""
    import requests

    cfg = load_config()
    records = load_records(cfg)
    audio_items = [r for r in records if r.get("type") == "audio" and r.get("src")]

    if not audio_items:
        console.print("[yellow]No audio to download.[/yellow]")
        return

    output_dir = output_dir or os.path.join(cfg["save_path"], "audio")
    os.makedirs(output_dir, exist_ok=True)

    downloaded = 0
    for item in audio_items:
        try:
            resp = requests.get(item["src"], timeout=60)
            resp.raise_for_status()

            ext = "wav" if convert_wav else item["src"].rsplit(".", 1)[-1][:4]
            fname = f"{item['id']}.{ext}"
            fpath = os.path.join(output_dir, fname)

            if convert_wav:
                try:
                    from pydub import AudioSegment
                    from io import BytesIO
                    audio = AudioSegment.from_file(BytesIO(resp.content))
                    audio.export(fpath, format="wav")
                except ImportError:
                    with open(fpath, "wb") as f:
                        f.write(resp.content)
            else:
                with open(fpath, "wb") as f:
                    f.write(resp.content)

            downloaded += 1
        except Exception:
            pass

    log_history("download.audio", f"Downloaded {downloaded} audio files")
    console.print(f"[green]Downloaded {downloaded} audio files[/green] to {output_dir}")


# ── 36. scrape schedule ──
@cli.command("schedule")
@click.argument("target_url")
@click.option("--every", "-e", default="1h", help="Interval: 30m, 1h, 6h, 1d")
@click.option("--count", "-n", default=0, help="Number of runs (0=infinite)")
def schedule(target_url, every, count):
    """Schedule recurring scrapes of a URL."""
    # Parse interval
    val = int(every[:-1])
    unit = every[-1]
    seconds = val * {"s": 1, "m": 60, "h": 3600, "d": 86400}.get(unit, 60)

    console.print(f"[blue]Scheduled:[/blue] Scrape {target_url} every {every}")
    console.print(f"Press Ctrl+C to stop.\n")

    runs = 0
    try:
        while count == 0 or runs < count:
            runs += 1
            console.print(f"\n[blue]Run #{runs}[/blue] at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            from click.testing import CliRunner
            runner = CliRunner()
            runner.invoke(scrape_url, [target_url])
            if count == 0 or runs < count:
                console.print(f"  Next run in {every}...")
                time.sleep(seconds)
    except KeyboardInterrupt:
        console.print(f"\n[yellow]Stopped after {runs} runs.[/yellow]")


# ── 37. scrape backup ──
@cli.command("backup")
@click.option("--output", "-o", default=None, help="Backup file path")
def backup(output):
    """Create a backup of all scraped data and config."""
    import zipfile

    cfg = load_config()
    if not output:
        output = f"webscraper-backup-{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"

    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
        # Config
        if os.path.exists(CONFIG_FILE):
            zf.write(CONFIG_FILE, "config.json")

        # History
        if os.path.exists(HISTORY_FILE):
            zf.write(HISTORY_FILE, "history.jsonl")

        # All data files
        save_path = cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))
        if os.path.exists(save_path):
            for root, dirs, files in os.walk(save_path):
                for fname in files:
                    fpath = os.path.join(root, fname)
                    arcname = os.path.join("data", os.path.relpath(fpath, save_path))
                    zf.write(fpath, arcname)

    size = format_bytes(os.path.getsize(output))
    log_history("backup", f"Created backup: {output} ({size})")
    console.print(f"[green]Backup created:[/green] {output} ({size})")


# ── 38. scrape restore ──
@cli.command("restore")
@click.argument("backup_file")
@click.confirmation_option(prompt="This will overwrite current data. Continue?")
def restore(backup_file):
    """Restore data from a backup file."""
    import zipfile

    if not os.path.exists(backup_file):
        console.print(f"[red]File not found: {backup_file}[/red]")
        return

    cfg = load_config()
    save_path = cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))

    with zipfile.ZipFile(backup_file, "r") as zf:
        for info in zf.infolist():
            if info.filename == "config.json":
                zf.extract(info, os.path.dirname(CONFIG_FILE))
            elif info.filename == "history.jsonl":
                zf.extract(info, os.path.dirname(HISTORY_FILE))
            elif info.filename.startswith("data/"):
                rel_path = info.filename[5:]  # Remove "data/"
                target = os.path.join(save_path, rel_path)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with zf.open(info) as src, open(target, "wb") as dst:
                    dst.write(src.read())

    log_history("restore", f"Restored from: {backup_file}")
    console.print(f"[green]Restored from {backup_file}[/green]")


# ── 39. scrape dedup ──
@cli.command("dedup")
@click.option("--dry-run", is_flag=True, help="Show duplicates without removing")
def dedup(dry_run):
    """Remove duplicate records from scraped data."""
    cfg = load_config()
    records = load_records(cfg)

    if not records:
        console.print("[yellow]No records to deduplicate.[/yellow]")
        return

    seen = set()
    unique = []
    dupes = 0

    for r in records:
        # Hash by content
        key = hashlib.md5(json.dumps(r, sort_keys=True).encode()).hexdigest()
        if key not in seen:
            seen.add(key)
            unique.append(r)
        else:
            dupes += 1

    if dry_run:
        console.print(f"[blue]Found {dupes} duplicates out of {len(records)} records.[/blue]")
        console.print(f"  Would keep: {len(unique)} unique records.")
        return

    if dupes == 0:
        console.print("[green]No duplicates found.[/green]")
        return

    # Rewrite data
    save_path = cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))
    dedup_file = os.path.join(save_path, f"deduped_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl")
    with open(dedup_file, "w") as f:
        for r in unique:
            f.write(json.dumps(r) + "\n")

    log_history("dedup", f"Removed {dupes} duplicates, {len(unique)} remaining")
    console.print(f"[green]Removed {dupes} duplicates.[/green] {len(unique)} unique records saved to {dedup_file}")


# ── 40. scrape search ──
@cli.command("search")
@click.argument("query")
@click.option("--type", "-t", "record_type", default=None, help="Filter by type: text/image/link/audio")
@click.option("--limit", "-n", default=20, help="Max results")
def search(query, record_type, limit):
    """Search through scraped data."""
    cfg = load_config()
    records = load_records(cfg)

    query_lower = query.lower()
    matches = []

    for r in records:
        if record_type and r.get("type") != record_type:
            continue

        searchable = json.dumps(r).lower()
        if query_lower in searchable:
            matches.append(r)

    if not matches:
        console.print(f"[yellow]No results for '{query}'[/yellow]")
        return

    table = Table(title=f"Search: '{query}' ({len(matches)} results)")
    table.add_column("Type", style="cyan", width=6)
    table.add_column("Content", style="white")
    table.add_column("Source", style="dim")

    for r in matches[:limit]:
        content = r.get("text", r.get("src", r.get("href", "")))[:80]
        source = r.get("source_url", "")[:40]
        table.add_row(r.get("type", "?"), content, source)

    console.print(table)
    if len(matches) > limit:
        console.print(f"  ... and {len(matches) - limit} more. Use --limit to show more.")


# ── 41. scrape info ──
@cli.command("info")
@click.argument("target_url")
def info(target_url):
    """Show metadata for a URL without scraping."""
    import requests
    from urllib.parse import urlparse

    try:
        headers = {"User-Agent": "WebScraperPro/1.0"}
        resp = requests.get(target_url, headers=headers, timeout=30)

        table = Table(title=f"URL Info: {target_url}")
        table.add_column("Field", style="cyan")
        table.add_column("Value", style="white")

        table.add_row("Status", str(resp.status_code))
        table.add_row("Content-Type", resp.headers.get("content-type", "?"))
        table.add_row("Content-Length", format_bytes(int(resp.headers.get("content-length", 0))))
        table.add_row("Server", resp.headers.get("server", "?"))
        table.add_row("Domain", urlparse(target_url).hostname or "?")

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, "html.parser")
        table.add_row("Title", soup.title.string if soup.title else "?")

        author = soup.find("meta", attrs={"name": "author"})
        table.add_row("Author", author["content"] if author else "?")

        desc = soup.find("meta", attrs={"name": "description"})
        table.add_row("Description", (desc["content"][:80] + "...") if desc else "?")

        table.add_row("Links", str(len(soup.find_all("a"))))
        table.add_row("Images", str(len(soup.find_all("img"))))
        table.add_row("Audio/Video", str(len(soup.find_all(["audio", "video"]))))
        table.add_row("Headings", str(len(soup.find_all(["h1", "h2", "h3"]))))
        table.add_row("Paragraphs", str(len(soup.find_all("p"))))

        # robots.txt
        domain = urlparse(target_url).hostname
        try:
            robots = requests.get(f"{urlparse(target_url).scheme}://{domain}/robots.txt", timeout=5)
            table.add_row("robots.txt", "Found" if robots.ok else "Not found")
        except Exception:
            table.add_row("robots.txt", "Unable to check")

        console.print(table)
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


# ── 42. scrape doctor ──
@cli.command("doctor")
def doctor():
    """Check system health and dependencies."""
    table = Table(title="System Health Check")
    table.add_column("Component", style="cyan")
    table.add_column("Status", style="white")
    table.add_column("Details", style="dim")

    # Python
    py_ver = sys.version.split()[0]
    py_minor = sys.version_info.minor
    if py_minor >= 10:
        table.add_row("Python", "[green]OK[/green]", f"{py_ver} (PyTorch compatible)")
    else:
        table.add_row("Python", "[yellow]WARN[/yellow]", f"{py_ver} - Upgrade to 3.10+")

    # Required packages
    packages = [
        ("click", "click"), ("rich", "rich"), ("requests", "requests"),
        ("beautifulsoup4", "bs4"), ("huggingface-hub", "huggingface_hub"),
        ("Pillow", "PIL"), ("pydub", "pydub"), ("tqdm", "tqdm"),
    ]
    for name, module in packages:
        try:
            __import__(module)
            table.add_row(name, "[green]OK[/green]", "Installed")
        except ImportError:
            table.add_row(name, "[red]MISSING[/red]", f"pip install {name}")

    # PyTorch (AI extraction)
    try:
        import torch
        torch_ver = torch.__version__
        cuda_str = ""
        if torch.cuda.is_available():
            gpu_info = get_gpu_info()
            gpu_arch = gpu_info.get("arch", "?")
            gpu_cc = gpu_info.get("compute_cap", "?")
            gpu_name = gpu_info.get("name", "?")
            gpu_mem = gpu_info.get("mem_gb", 0)
            cuda_ver = gpu_info.get("cuda_version", "?")
            cuda_str = f" | CUDA {cuda_ver}"
            table.add_row("PyTorch (AI)", "[green]OK[/green]", f"{torch_ver}{cuda_str}")
            table.add_row("GPU", "[green]OK[/green]", f"{gpu_name} ({gpu_mem}GB)")
            table.add_row("GPU Arch", "[green]OK[/green]", f"{gpu_arch} (sm_{gpu_cc.replace('.', '')}, CC {gpu_cc})")

            # Check compat
            compat_ok, compat_msg = check_gpu_pytorch_compat(gpu_info)
            if compat_ok:
                table.add_row("GPU Compat", "[green]OK[/green]", compat_msg)
            else:
                table.add_row("GPU Compat", "[red]ISSUE[/red]", compat_msg[:80])
        else:
            table.add_row("PyTorch (AI)", "[green]OK[/green]", f"{torch_ver} | CPU only (no CUDA)")
    except ImportError:
        if py_minor < 10:
            table.add_row("PyTorch (AI)", "[red]UNAVAILABLE[/red]", f"Needs Python 3.10+ (have {py_ver})")
        else:
            table.add_row("PyTorch (AI)", "[yellow]MISSING[/yellow]", "pip install torch (optional, for AI)")

    # transformers
    try:
        import transformers
        table.add_row("Transformers (AI)", "[green]OK[/green]", transformers.__version__)
    except ImportError:
        table.add_row("Transformers (AI)", "[yellow]MISSING[/yellow]", "Optional: pip install transformers")

    # tkinter
    try:
        import tkinter
        table.add_row("tkinter (GUI)", "[green]OK[/green]", "Available")
    except ImportError:
        table.add_row("tkinter (GUI)", "[yellow]MISSING[/yellow]", "Optional: for GUI")

    # ffmpeg
    if shutil.which("ffmpeg"):
        table.add_row("ffmpeg", "[green]OK[/green]", shutil.which("ffmpeg"))
    else:
        table.add_row("ffmpeg", "[yellow]MISSING[/yellow]", "Optional: for audio conversion")

    # Firefox
    firefox_paths = ["firefox", "firefox-esr", "/usr/bin/firefox",
                     "/snap/bin/firefox", "/usr/lib/firefox/firefox"]
    found_ff = None
    for fp in firefox_paths:
        if shutil.which(fp):
            found_ff = fp
            break
    if found_ff:
        table.add_row("Firefox", "[green]OK[/green]", found_ff)
    else:
        table.add_row("Firefox", "[yellow]NOT FOUND[/yellow]", "Required for extension")

    # Extension
    ext_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "extension")
    manifest = os.path.join(ext_dir, "manifest.json")
    if os.path.exists(manifest):
        table.add_row("Extension", "[green]OK[/green]", ext_dir)
    else:
        table.add_row("Extension", "[red]NOT FOUND[/red]", f"Expected at {ext_dir}")

    # Config
    table.add_row("Config", "[green]OK[/green]" if os.path.exists(CONFIG_FILE) else "[yellow]DEFAULT[/yellow]",
                  CONFIG_FILE)

    # Data directory
    cfg = load_config()
    save_path = cfg.get("save_path", "")
    table.add_row("Data Dir", "[green]OK[/green]" if os.path.exists(save_path) else "[yellow]EMPTY[/yellow]",
                  save_path)

    # Disk space
    try:
        usage = shutil.disk_usage(os.path.expanduser("~"))
        free = format_bytes(usage.free)
        table.add_row("Disk Space", "[green]OK[/green]", f"{free} free")
    except Exception:
        pass

    console.print(table)


# ── 43. scrape env ──
@cli.command("env")
def env():
    """Show environment information."""
    import platform

    table = Table(title="Environment")
    table.add_column("Key", style="cyan")
    table.add_column("Value", style="white")

    table.add_row("OS", platform.platform())
    table.add_row("Python", sys.version.split()[0])
    table.add_row("Python Path", sys.executable)
    table.add_row("CLI Version", VERSION)
    table.add_row("Config Dir", get_config_dir())
    table.add_row("Data Dir", DATA_DIR)
    table.add_row("Config File", CONFIG_FILE)
    table.add_row("History File", HISTORY_FILE)
    table.add_row("Owner Repo", OWNER_HF_REPO)

    cfg = load_config()
    table.add_row("Save Path", cfg.get("save_path", "N/A"))
    table.add_row("HF Repo", cfg.get("hf_repo_id", "Not set"))

    ext_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "extension")
    table.add_row("Extension Dir", ext_dir)

    console.print(table)


# ── 44. scrape profile ──
@cli.command("profile")
@click.argument("name", default="default")
@click.option("--save", "-s", is_flag=True, help="Save current config as profile")
@click.option("--load", "-l", "load_profile", is_flag=True, help="Load this profile")
@click.option("--list", "-L", "list_profiles", is_flag=True, help="List all profiles")
@click.option("--delete", "-d", "delete_profile", is_flag=True, help="Delete this profile")
def profile(name, save, load_profile, list_profiles, delete_profile):
    """Manage configuration profiles."""
    profiles_dir = os.path.join(get_config_dir(), "profiles")
    os.makedirs(profiles_dir, exist_ok=True)

    if list_profiles:
        profiles = [f[:-5] for f in os.listdir(profiles_dir) if f.endswith(".json")]
        if not profiles:
            console.print("[yellow]No saved profiles.[/yellow]")
        else:
            for p in profiles:
                console.print(f"  - [cyan]{p}[/cyan]")
        return

    profile_file = os.path.join(profiles_dir, f"{name}.json")

    if delete_profile:
        if os.path.exists(profile_file):
            os.remove(profile_file)
            console.print(f"[green]Deleted profile: {name}[/green]")
        else:
            console.print(f"[yellow]Profile not found: {name}[/yellow]")
        return

    if save:
        cfg = load_config()
        with open(profile_file, "w") as f:
            json.dump(cfg, f, indent=2)
        console.print(f"[green]Saved current config as profile: {name}[/green]")
        return

    if load_profile:
        if os.path.exists(profile_file):
            with open(profile_file, "r") as f:
                cfg = json.load(f)
            save_config(cfg)
            console.print(f"[green]Loaded profile: {name}[/green]")
        else:
            console.print(f"[yellow]Profile not found: {name}[/yellow]")
        return

    # Default: show profile info
    if os.path.exists(profile_file):
        with open(profile_file, "r") as f:
            cfg = json.load(f)
        table = Table(title=f"Profile: {name}")
        table.add_column("Key", style="cyan")
        table.add_column("Value", style="white")
        for k, v in sorted(cfg.items()):
            if k == "hf_token" and v:
                v = "****"
            table.add_row(k, str(v))
        console.print(table)
    else:
        console.print(f"[yellow]Profile '{name}' doesn't exist. Use --save to create it.[/yellow]")


# ── 45. scrape robots ──
@cli.command("robots")
@click.argument("target_url")
def check_robots(target_url):
    """Check robots.txt for a URL."""
    import requests
    from urllib.parse import urlparse

    parsed = urlparse(target_url)
    robots_url = f"{parsed.scheme}://{parsed.hostname}/robots.txt"

    try:
        resp = requests.get(robots_url, timeout=10)
        if resp.ok:
            console.print(f"[green]robots.txt for {parsed.hostname}:[/green]\n")
            console.print(resp.text)
        else:
            console.print(f"[yellow]No robots.txt found for {parsed.hostname}[/yellow]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


# ── 46. scrape sitemap ──
@cli.command("sitemap")
@click.argument("target_url")
@click.option("--scrape-all", "-a", is_flag=True, help="Scrape all URLs from sitemap")
def sitemap(target_url, scrape_all):
    """Parse and optionally scrape all URLs from a sitemap."""
    import requests
    from urllib.parse import urlparse

    parsed = urlparse(target_url)
    sitemap_url = target_url if "sitemap" in target_url else f"{parsed.scheme}://{parsed.hostname}/sitemap.xml"

    try:
        resp = requests.get(sitemap_url, timeout=15)
        if not resp.ok:
            console.print(f"[yellow]No sitemap found at {sitemap_url}[/yellow]")
            return

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, "xml")
        urls = [loc.text for loc in soup.find_all("loc")]

        console.print(f"[green]Found {len(urls)} URLs in sitemap[/green]")
        for i, url in enumerate(urls[:50], 1):
            console.print(f"  {i}. {url}")
        if len(urls) > 50:
            console.print(f"  ... and {len(urls) - 50} more")

        if scrape_all:
            console.print(f"\n[blue]Scraping all {len(urls)} URLs...[/blue]")
            from click.testing import CliRunner
            runner = CliRunner()
            for url in urls:
                runner.invoke(scrape_url, [url])
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


# ── 47. scrape diff ──
@cli.command("diff")
@click.argument("file1")
@click.argument("file2")
def diff_files(file1, file2):
    """Compare two JSONL data files."""
    def load_jsonl(path):
        records = {}
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        r = json.loads(line)
                        rid = r.get("id", hashlib.md5(line.encode()).hexdigest())
                        records[rid] = r
                    except json.JSONDecodeError:
                        pass
        return records

    r1 = load_jsonl(file1)
    r2 = load_jsonl(file2)

    only_in_1 = set(r1.keys()) - set(r2.keys())
    only_in_2 = set(r2.keys()) - set(r1.keys())
    common = set(r1.keys()) & set(r2.keys())

    console.print(f"[cyan]File 1:[/cyan] {file1} ({len(r1)} records)")
    console.print(f"[cyan]File 2:[/cyan] {file2} ({len(r2)} records)")
    console.print(f"\n  Only in file 1: [yellow]{len(only_in_1)}[/yellow]")
    console.print(f"  Only in file 2: [yellow]{len(only_in_2)}[/yellow]")
    console.print(f"  Common records: [green]{len(common)}[/green]")


# ── 48. scrape head ──
@cli.command("head")
@click.argument("file", default=None, required=False)
@click.option("--lines", "-n", default=10, help="Number of records to show")
def head(file, lines):
    """Show first N records from data."""
    cfg = load_config()
    if file:
        records = []
        with open(file, "r") as f:
            for i, line in enumerate(f):
                if i >= lines:
                    break
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    else:
        records = load_records(cfg)[:lines]

    for r in records:
        rprint(r)
    console.print(f"\n[dim]Showing {len(records)} records[/dim]")


# ── 49. scrape tail ──
@cli.command("tail")
@click.argument("file", default=None, required=False)
@click.option("--lines", "-n", default=10, help="Number of records to show")
def tail(file, lines):
    """Show last N records from data."""
    cfg = load_config()
    if file:
        all_recs = []
        with open(file, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        all_recs.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        records = all_recs[-lines:]
    else:
        records = load_records(cfg)[-lines:]

    for r in records:
        rprint(r)
    console.print(f"\n[dim]Showing last {len(records)} records[/dim]")


# ── 50. scrape count ──
@cli.command("count")
@click.option("--by-type", is_flag=True, help="Count by record type")
@click.option("--by-source", is_flag=True, help="Count by source URL")
def count(by_type, by_source):
    """Count records in scraped data."""
    cfg = load_config()
    records = load_records(cfg)

    if by_type:
        counts = {}
        for r in records:
            t = r.get("type", "unknown")
            counts[t] = counts.get(t, 0) + 1
        table = Table(title="Records by Type")
        table.add_column("Type", style="cyan")
        table.add_column("Count", style="white")
        for t, c in sorted(counts.items(), key=lambda x: -x[1]):
            table.add_row(t, str(c))
        console.print(table)
    elif by_source:
        counts = {}
        for r in records:
            s = r.get("source_url", "unknown")
            counts[s] = counts.get(s, 0) + 1
        table = Table(title="Records by Source")
        table.add_column("Source", style="cyan")
        table.add_column("Count", style="white")
        for s, c in sorted(counts.items(), key=lambda x: -x[1])[:30]:
            table.add_row(s[:60], str(c))
        console.print(table)
    else:
        console.print(f"Total records: [bold]{len(records)}[/bold]")


# ── 51. scrape sample ──
@cli.command("sample")
@click.option("--count", "-n", default=5, help="Number of samples")
@click.option("--type", "-t", "record_type", default=None)
def sample(count, record_type):
    """Show random sample records."""
    import random
    cfg = load_config()
    records = load_records(cfg)

    if record_type:
        records = [r for r in records if r.get("type") == record_type]

    if not records:
        console.print("[yellow]No records found.[/yellow]")
        return

    samples = random.sample(records, min(count, len(records)))
    for r in samples:
        rprint(r)
        console.print()


# ── 52. scrape ai.serve ──
@cli.command("ai.serve")
@click.option("--gpu/--cpu", default=None, help="Force GPU or CPU mode (auto-detect if not specified)")
@click.option("--port", "-p", default=8377, type=int, help="Server port")
@click.option("--model", default="numind/NuExtract-2.0-2B", help="HuggingFace model ID")
def ai_serve(gpu, port, model):
    """Start the NuExtract AI extraction server.

    This runs a local HTTP server that the browser extension can connect to
    for AI-powered structured data extraction. Works on GPU (min GTX 1070,
    compute capability 6.1+) or CPU (any modern Intel/AMD processor).

    Supported GPUs: Pascal (GTX 1070/1080/1080 Ti), Volta, Turing (RTX 2000),
    Ampere (RTX 3000), Ada Lovelace (RTX 4000), Hopper.

    Requirements: pip install torch torchvision transformers
    Requires Python 3.10-3.13 (PyTorch does not support 3.14+).
    Pascal GPUs (GTX 1070/1080): Use PyTorch <=2.4.1 with CUDA 11.8.
    """
    # Check Python version — 3.14+ not supported by PyTorch, use venv fallback
    if not _ensure_ai_venv():
        return

    py_minor = sys.version_info.minor
    if py_minor < 10:
        console.print(f"[red]Python {sys.version_info.major}.{py_minor} is too old. PyTorch requires Python 3.10+.[/red]")
        return

    try:
        import torch
    except ImportError:
        console.print("[red]PyTorch not installed. Run 'scrape ai.setup' to auto-install.[/red]")
        return

    try:
        import torchvision  # noqa: F401
    except ImportError:
        console.print("[red]torchvision not installed. Run 'scrape ai.setup' or: pip install torchvision[/red]")
        return

    try:
        from transformers import AutoProcessor
        try:
            from transformers import AutoModelForImageTextToText as AutoVisionModel
        except ImportError:
            from transformers import AutoModelForVision2Seq as AutoVisionModel
    except ImportError:
        console.print("[red]Transformers not installed. Run 'scrape ai.setup' to auto-install.[/red]")
        return

    # Determine device
    if gpu is True:
        if not torch.cuda.is_available():
            console.print("[red]GPU requested but CUDA not available.[/red]")
            return
        device = "cuda"
    elif gpu is False:
        device = "cpu"
    else:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    console.print(f"[bold blue]NuExtract AI Server[/bold blue]")
    console.print(f"  Model:  [cyan]{model}[/cyan]")
    console.print(f"  Device: [cyan]{device}[/cyan]")

    if device == "cuda":
        gpu_info = get_gpu_info()
        gpu_name = gpu_info.get("name", "Unknown")
        gpu_mem = gpu_info.get("mem_gb", 0)
        gpu_arch = gpu_info.get("arch", "Unknown")
        gpu_cc = gpu_info.get("compute_cap", "?")
        console.print(f"  GPU:    [cyan]{gpu_name} ({gpu_mem} GB)[/cyan]")
        console.print(f"  Arch:   [cyan]{gpu_arch} (sm_{gpu_cc.replace('.', '')})[/cyan]")
        console.print(f"  CUDA:   [cyan]{gpu_info.get('cuda_version', '?')}[/cyan]")

        # Check compatibility
        compat_ok, compat_msg = check_gpu_pytorch_compat(gpu_info)
        if not compat_ok:
            console.print(f"\n[red]GPU compatibility issue:[/red] {compat_msg}")
            console.print("[yellow]Falling back to CPU mode.[/yellow]")
            device = "cpu"

    console.print(f"  Port:   [cyan]{port}[/cyan]")
    console.print()

    console.print("[yellow]Loading model (this may take a minute on first run)...[/yellow]")

    # Load model with appropriate settings for the device
    if device == "cuda":
        gpu_info = get_gpu_info()
        gpu_arch = gpu_info.get("arch", "")
        cc_str = gpu_info.get("compute_cap", "0.0")
        cc_major = int(cc_str.split(".")[0]) if cc_str else 0

        # Ampere+ (cc >= 8.0): use bfloat16 + flash_attention_2 if available
        # Pascal/Volta/Turing (cc < 8.0): use float16, eager attention
        if cc_major >= 8:
            use_dtype = torch.bfloat16
            # Try flash_attention_2, fall back to sdpa/eager
            try:
                model_obj = AutoVisionModel.from_pretrained(
                    model,
                    trust_remote_code=True,
                    torch_dtype=use_dtype,
                    attn_implementation="flash_attention_2",
                    device_map="auto",
                )
                console.print("  [dim]Using bfloat16 + flash_attention_2[/dim]")
            except (ImportError, ValueError):
                model_obj = AutoVisionModel.from_pretrained(
                    model,
                    trust_remote_code=True,
                    torch_dtype=use_dtype,
                    device_map="auto",
                )
                console.print("  [dim]Using bfloat16 (flash_attention_2 not available)[/dim]")
        else:
            use_dtype = torch.float16
            model_obj = AutoVisionModel.from_pretrained(
                model,
                trust_remote_code=True,
                torch_dtype=use_dtype,
                device_map="auto",
            )
            console.print(f"  [dim]Using float16 (compute capability {cc_str})[/dim]")
    else:
        # CPU mode — use float32, no device_map
        model_obj = AutoVisionModel.from_pretrained(
            model,
            trust_remote_code=True,
            torch_dtype=torch.float32,
        )
        model_obj = model_obj.to("cpu")

    processor = AutoProcessor.from_pretrained(model, trust_remote_code=True, padding_side="left", use_fast=True)
    console.print("[green]Model loaded successfully![/green]")
    console.print(f"[bold]Server starting at http://127.0.0.1:{port}[/bold]")
    console.print("[dim]Press Ctrl+C to stop[/dim]\n")

    # Start HTTP server
    import http.server
    import json as json_mod

    class NuExtractHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            console.print(f"[dim]{self.address_string()} {fmt % args}[/dim]")

        def _set_cors_headers(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def do_OPTIONS(self):
            self.send_response(200)
            self._set_cors_headers()
            self.end_headers()

        def do_GET(self):
            if self.path == "/health":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._set_cors_headers()
                self.end_headers()
                info = {
                    "status": "ready",
                    "model": model,
                    "device": device,
                    "version": VERSION,
                }
                if device == "cuda":
                    gi = get_gpu_info()
                    info["gpu"] = gi.get("name", torch.cuda.get_device_name(0))
                    info["gpu_memory_gb"] = gi.get("mem_gb", 0)
                    info["gpu_arch"] = gi.get("arch", "Unknown")
                    info["compute_capability"] = gi.get("compute_cap", "?")
                    info["cuda_version"] = gi.get("cuda_version", "?")
                self.wfile.write(json_mod.dumps(info).encode())
            elif self.path == "/templates":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._set_cors_headers()
                self.end_headers()
                templates = _get_ai_templates()
                self.wfile.write(json_mod.dumps(templates).encode())
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path == "/extract":
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len)
                try:
                    req = json_mod.loads(body)
                except json_mod.JSONDecodeError:
                    self.send_error(400, "Invalid JSON")
                    return

                text = req.get("text", "")
                template = req.get("template", {})
                max_tokens = req.get("max_tokens", 2048)

                if not text:
                    self.send_error(400, "Missing 'text' field")
                    return
                if not template:
                    self.send_error(400, "Missing 'template' field")
                    return

                try:
                    result = _run_extraction(model_obj, processor, text, template, max_tokens, device)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self._set_cors_headers()
                    self.end_headers()
                    self.wfile.write(json_mod.dumps(result).encode())
                except Exception as e:
                    self.send_error(500, str(e))
            else:
                self.send_error(404)

    server = http.server.HTTPServer(("127.0.0.1", port), NuExtractHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        console.print("\n[yellow]Server stopped.[/yellow]")
        server.server_close()


def _run_extraction(model_obj, processor, text, template, max_tokens, device):
    """Run NuExtract 2.0 extraction on text with a given template.

    Uses the Qwen2-VL based chat template format required by NuExtract 2.0.
    """
    import torch
    import json as json_mod

    template_str = json_mod.dumps(template) if isinstance(template, dict) else str(template)

    # NuExtract 2.0 uses apply_chat_template with template parameter (Qwen2-VL based)
    messages = [{"role": "user", "content": text}]

    prompt = processor.tokenizer.apply_chat_template(
        messages,
        template=template_str,
        tokenize=False,
        add_generation_prompt=True,
    )

    # Process inputs — images=None for text-only extraction
    inputs = processor(
        text=[prompt],
        images=None,
        padding=True,
        return_tensors="pt",
    )
    if device == "cuda":
        inputs = inputs.to("cuda")
    elif device == "cpu":
        inputs = inputs.to("cpu")

    with torch.no_grad():
        generated_ids = model_obj.generate(
            **inputs,
            do_sample=False,
            num_beams=1,
            max_new_tokens=max_tokens,
        )

    # Decode only the newly generated tokens (trim input prefix)
    generated_ids_trimmed = [
        out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
    ]
    output_texts = processor.batch_decode(
        generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
    )
    result_text = output_texts[0].strip() if output_texts else ""

    # Try to parse as JSON
    try:
        return json_mod.loads(result_text)
    except json_mod.JSONDecodeError:
        # Try to extract JSON from the output (model may add extra text)
        import re
        json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', result_text, re.DOTALL)
        if json_match:
            try:
                return json_mod.loads(json_match.group())
            except json_mod.JSONDecodeError:
                pass
        return {"raw_output": result_text}


def _get_ai_templates():
    """Get predefined extraction templates."""
    return {
        "article": {
            "title": "verbatim-string",
            "author": "verbatim-string",
            "date_published": "date-time",
            "summary": "string",
            "key_points": ["string"],
            "topics": [["Technology", "Science", "Politics", "Business", "Health",
                        "Sports", "Entertainment", "Education", "Environment", "Other"]],
            "sentiment": ["Positive", "Negative", "Neutral", "Mixed"],
        },
        "product": {
            "product_name": "verbatim-string",
            "price": "number",
            "currency": "verbatim-string",
            "brand": "verbatim-string",
            "description": "string",
            "rating": "number",
            "features": ["string"],
            "availability": ["In Stock", "Out of Stock", "Pre-order", "Unknown"],
        },
        "contact": {
            "names": ["verbatim-string"],
            "emails": ["verbatim-string"],
            "phone_numbers": ["verbatim-string"],
            "addresses": ["string"],
            "companies": ["verbatim-string"],
            "job_titles": ["verbatim-string"],
        },
        "event": {
            "event_name": "verbatim-string",
            "date": "date-time",
            "location": "string",
            "organizer": "verbatim-string",
            "description": "string",
        },
        "recipe": {
            "recipe_name": "verbatim-string",
            "servings": "integer",
            "prep_time_minutes": "integer",
            "cook_time_minutes": "integer",
            "ingredients": ["string"],
            "instructions": ["string"],
        },
        "research": {
            "title": "verbatim-string",
            "authors": ["verbatim-string"],
            "abstract": "string",
            "key_findings": ["string"],
            "publication_date": "date-time",
            "doi": "verbatim-string",
        },
        "job": {
            "job_title": "verbatim-string",
            "company": "verbatim-string",
            "location": "string",
            "salary_range": "string",
            "employment_type": ["Full-time", "Part-time", "Contract", "Freelance", "Internship", "Remote"],
            "experience_level": ["Entry", "Mid", "Senior", "Lead", "Executive"],
            "required_skills": ["verbatim-string"],
            "description": "string",
            "benefits": ["string"],
            "application_url": "verbatim-string",
        },
        "review": {
            "product_name": "verbatim-string",
            "reviewer": "verbatim-string",
            "rating": "number",
            "rating_max": "number",
            "title": "verbatim-string",
            "pros": ["string"],
            "cons": ["string"],
            "summary": "string",
            "verified_purchase": ["Yes", "No", "Unknown"],
            "date": "date-time",
        },
    }


# ── 53. scrape ai.extract ──
@cli.command("ai.extract")
@click.argument("template_name", default="article")
@click.option("--file", "-f", "input_file", default=None, help="Input text file to extract from")
@click.option("--text", "-t", default=None, help="Inline text to extract from")
@click.option("--server", default="http://127.0.0.1:8377", help="AI server URL")
@click.option("--output", "-o", default=None, help="Output file (default: stdout)")
def ai_extract(template_name, input_file, text, server, output):
    """Extract structured data from text using NuExtract AI.

    TEMPLATE_NAME can be: article, product, contact, event, recipe, research, job, review
    Or a path to a JSON template file.
    """
    import requests

    # Get text
    if input_file:
        with open(input_file, "r") as f:
            text = f.read()
    elif text is None:
        # Read from scraped data
        cfg = load_config()
        records = load_records(cfg)
        text_records = [r for r in records if r.get("type") == "text"]
        if not text_records:
            console.print("[yellow]No text records found. Provide --file or --text[/yellow]")
            return
        # Use the longest text record
        text = max(text_records, key=lambda r: len(r.get("text", "")))["text"]
        console.print(f"[dim]Using longest text record ({len(text)} chars)[/dim]")

    # Get template
    templates = _get_ai_templates()
    if template_name in templates:
        template = templates[template_name]
    elif os.path.exists(template_name):
        with open(template_name, "r") as f:
            template = json.load(f)
    else:
        console.print(f"[red]Unknown template '{template_name}'. Available: {', '.join(templates.keys())}[/red]")
        return

    # Truncate long text
    if len(text) > 4000:
        console.print(f"[dim]Text truncated from {len(text)} to 4000 chars[/dim]")
        text = text[:4000]

    console.print(f"[yellow]Extracting with template '{template_name}'...[/yellow]")

    try:
        resp = requests.post(f"{server}/extract", json={
            "text": text,
            "template": template,
            "max_tokens": 2048,
        }, timeout=120)

        if resp.status_code != 200:
            console.print(f"[red]Server error ({resp.status_code}): {resp.text}[/red]")
            return

        result = resp.json()

        if output:
            with open(output, "w") as f:
                json.dump(result, f, indent=2)
            console.print(f"[green]Result saved to {output}[/green]")
        else:
            rprint(result)

    except requests.ConnectionError:
        console.print("[red]Cannot connect to AI server.[/red]")
        console.print("[dim]Start it with: scrape ai.serve[/dim]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


# ── 54. scrape ai.status ──
@cli.command("ai.status")
@click.option("--server", default="http://127.0.0.1:8377", help="AI server URL")
def ai_status(server):
    """Check if the NuExtract AI server is running."""
    import requests

    try:
        resp = requests.get(f"{server}/health", timeout=5)
        if resp.ok:
            info = resp.json()
            console.print(Panel(
                f"[green]Server is running![/green]\n\n"
                f"  Model:  [cyan]{info.get('model', 'unknown')}[/cyan]\n"
                f"  Device: [cyan]{info.get('device', 'unknown')}[/cyan]\n"
                f"  GPU:    [cyan]{info.get('gpu', 'N/A')}[/cyan]\n"
                f"  Memory: [cyan]{info.get('gpu_memory_gb', 'N/A')} GB[/cyan]\n"
                f"  Version: [cyan]{info.get('version', 'unknown')}[/cyan]",
                title="NuExtract AI Server",
                border_style="green"
            ))
        else:
            console.print(f"[red]Server returned status {resp.status_code}[/red]")
    except requests.ConnectionError:
        console.print("[red]AI server is not running.[/red]")
        console.print("[dim]Start it with: scrape ai.serve[/dim]")
        console.print("[dim]  GPU mode: scrape ai.serve --gpu[/dim]")
        console.print("[dim]  CPU mode: scrape ai.serve --cpu[/dim]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


# ── 55. scrape ai.setup ──
@cli.command("ai.setup")
@click.option("--gpu/--cpu", default=None, help="Configure for GPU or CPU")
def ai_setup(gpu):
    """Download and configure NuExtract model.

    This will install required dependencies and download the model.
    GPU mode requires CUDA-capable GPU (min GTX 1070 8GB).
    CPU mode works on any modern processor (i7-7660U, i7-7700HQ, etc.).
    Requires Python 3.10-3.13 (PyTorch does not support 3.14+).
    Pascal GPUs (GTX 1070/1080): Use PyTorch <=2.4.1 with CUDA 11.8.
    """
    console.print("[bold blue]NuExtract AI Setup[/bold blue]\n")

    # Check Python version — 3.14+ not supported by PyTorch, use venv fallback
    if not _ensure_ai_venv():
        return

    py_ver = sys.version_info
    console.print(f"  Python: [cyan]{py_ver.major}.{py_ver.minor}.{py_ver.micro}[/cyan]")

    if py_ver.minor < 10:
        console.print(f"  [red]Python {py_ver.major}.{py_ver.minor} is too old for PyTorch.[/red]")
        console.print("  [yellow]Upgrade to Python 3.10+.[/yellow]")
        return

    console.print(f"  Python compatibility: [green]OK[/green] (3.10-3.13)")

    # Check PyTorch
    try:
        import torch
        console.print(f"  PyTorch: [green]{torch.__version__}[/green]")
        cuda_available = torch.cuda.is_available()
        console.print(f"  CUDA: [{'green' if cuda_available else 'yellow'}]{cuda_available}[/{'green' if cuda_available else 'yellow'}]")
        if cuda_available:
            gpu_info = get_gpu_info()
            gpu_arch = gpu_info.get("arch", "Unknown")
            gpu_cc = gpu_info.get("compute_cap", "?")
            console.print(f"  GPU: [cyan]{gpu_info.get('name', '?')}[/cyan]")
            console.print(f"  Architecture: [cyan]{gpu_arch} (compute capability {gpu_cc})[/cyan]")
            console.print(f"  GPU Memory: [cyan]{gpu_info.get('mem_gb', 0)} GB[/cyan]")
            console.print(f"  CUDA toolkit: [cyan]{gpu_info.get('cuda_version', '?')}[/cyan]")
            if gpu_info.get("mem_gb", 0) < 6:
                console.print("[yellow]  Warning: Less than 6GB VRAM. Model may not fit on GPU.[/yellow]")

            # Check compatibility
            compat_ok, compat_msg = check_gpu_pytorch_compat(gpu_info)
            if compat_ok:
                console.print(f"  Compatibility: [green]{compat_msg}[/green]")
            else:
                console.print(f"  Compatibility: [red]ISSUE[/red]")
                console.print(f"  [yellow]{compat_msg}[/yellow]")
    except ImportError:
        console.print("  PyTorch: [red]Not installed[/red]")
        console.print()

        # Auto-detect GPU to pick the right install command
        gpu_mode = gpu  # True=gpu, False=cpu, None=auto
        install_url = None
        torch_pin = ""

        if gpu_mode is not False:
            # Try to detect NVIDIA GPU via nvidia-smi
            try:
                import subprocess as _sp
                nv = _sp.run(["nvidia-smi", "--query-gpu=name,compute_cap", "--format=csv,noheader"],
                             capture_output=True, text=True, timeout=10)
                if nv.returncode == 0 and nv.stdout.strip():
                    line = nv.stdout.strip().split("\n")[0]
                    parts = [p.strip() for p in line.split(",")]
                    gpu_name = parts[0] if parts else "Unknown"
                    cc_str = parts[1] if len(parts) > 1 else "0.0"
                    cc_major = int(cc_str.split(".")[0])
                    console.print(f"  GPU detected: [cyan]{gpu_name}[/cyan] (compute {cc_str})")
                    if cc_major <= 6:
                        # Pascal or older — cu118 wheels include sm_61 support
                        # Don't pin version: 2.4.1 doesn't support Python 3.13+
                        install_url = "https://download.pytorch.org/whl/cu118"
                        console.print("  [dim]Pascal GPU detected - using CUDA 11.8 wheels (sm_61 support)[/dim]")
                    else:
                        install_url = "https://download.pytorch.org/whl/cu121"
                        console.print("  [dim]Modern GPU detected - using latest PyTorch + CUDA 12.1[/dim]")
                else:
                    if gpu_mode is True:
                        console.print("  [yellow]No NVIDIA GPU detected but --gpu was specified[/yellow]")
                        install_url = "https://download.pytorch.org/whl/cu121"
                    else:
                        console.print("  [dim]No NVIDIA GPU found, installing CPU-only PyTorch[/dim]")
                        install_url = "https://download.pytorch.org/whl/cpu"
            except FileNotFoundError:
                if gpu_mode is True:
                    console.print("  [yellow]nvidia-smi not found but --gpu was specified[/yellow]")
                    install_url = "https://download.pytorch.org/whl/cu121"
                else:
                    console.print("  [dim]nvidia-smi not found, installing CPU-only PyTorch[/dim]")
                    install_url = "https://download.pytorch.org/whl/cpu"
            except Exception:
                install_url = "https://download.pytorch.org/whl/cpu"
        else:
            install_url = "https://download.pytorch.org/whl/cpu"
            console.print("  [dim]CPU mode requested[/dim]")

        pip_cmd = f"torch{torch_pin}"
        full_cmd = [sys.executable, "-m", "pip", "install", pip_cmd, "torchvision", "--index-url", install_url]
        console.print(f"\n[yellow]Installing PyTorch...[/yellow]")
        console.print(f"[dim]  {' '.join(full_cmd)}[/dim]")

        import subprocess as _sp
        result = _sp.run(full_cmd, capture_output=False, text=True)
        if result.returncode != 0:
            console.print("[red]PyTorch installation failed.[/red]")
            console.print("[dim]Try manually:[/dim]")
            console.print(f"[dim]  pip install {pip_cmd} --index-url {install_url}[/dim]")
            return

        console.print("[green]PyTorch installed successfully![/green]")

        # Re-check after install
        try:
            import importlib
            import torch
            importlib.reload(torch)
            console.print(f"  PyTorch: [green]{torch.__version__}[/green]")
        except Exception:
            console.print("[yellow]PyTorch installed but needs a restart. Run 'scrape ai.setup' again.[/yellow]")
            return

    # Check torchvision (required by Qwen2VLProcessor)
    try:
        import torchvision  # noqa: F401
        console.print(f"  torchvision: [green]{torchvision.__version__}[/green]")
    except ImportError:
        console.print("  torchvision: [red]Not installed[/red]")
        console.print("\n[yellow]Installing torchvision (required by Qwen2VL processor)...[/yellow]")
        import subprocess as _sp
        # Use the same CUDA index URL as torch for compatible builds
        tv_cmd = [sys.executable, "-m", "pip", "install", "torchvision"]
        # Detect torch CUDA variant for matching torchvision
        try:
            tv_url = None
            if torch.cuda.is_available():
                cuda_ver = torch.version.cuda
                if cuda_ver and cuda_ver.startswith("11"):
                    tv_url = "https://download.pytorch.org/whl/cu118"
                elif cuda_ver and cuda_ver.startswith("12.1"):
                    tv_url = "https://download.pytorch.org/whl/cu121"
                elif cuda_ver:
                    tv_url = "https://download.pytorch.org/whl/cu124"
            else:
                tv_url = "https://download.pytorch.org/whl/cpu"
            if tv_url:
                tv_cmd += ["--index-url", tv_url]
        except Exception:
            pass
        result = _sp.run(tv_cmd, capture_output=False, text=True)
        if result.returncode != 0:
            console.print("[yellow]torchvision install failed. Trying without index URL...[/yellow]")
            result = _sp.run([sys.executable, "-m", "pip", "install", "torchvision"], capture_output=False, text=True)
            if result.returncode != 0:
                console.print("[red]torchvision installation failed.[/red]")
                console.print("[dim]Try manually: pip install torchvision[/dim]")
                return
        console.print("[green]torchvision installed![/green]")

    # Check transformers
    try:
        import transformers
        console.print(f"  Transformers: [green]{transformers.__version__}[/green]")
    except ImportError:
        console.print("  Transformers: [red]Not installed[/red]")
        console.print("\n[yellow]Installing transformers...[/yellow]")
        import subprocess as _sp
        result = _sp.run([sys.executable, "-m", "pip", "install", "transformers"], capture_output=False, text=True)
        if result.returncode != 0:
            console.print("[red]Transformers installation failed.[/red]")
            console.print("[dim]Try manually: pip install transformers[/dim]")
            return
        console.print("[green]Transformers installed![/green]")
        try:
            import transformers
            console.print(f"  Transformers: [green]{transformers.__version__}[/green]")
        except Exception:
            console.print("[yellow]Installed but needs restart. Run 'scrape ai.setup' again.[/yellow]")
            return

    # Check qwen_vl_utils (needed by NuExtract 2.0 Qwen2-VL processor)
    try:
        import qwen_vl_utils  # noqa: F401
        console.print(f"  qwen_vl_utils: [green]OK[/green]")
    except ImportError:
        console.print("  qwen_vl_utils: [yellow]Not installed[/yellow]")
        console.print("\n[yellow]Installing qwen_vl_utils (needed by NuExtract 2.0 processor)...[/yellow]")
        import subprocess as _sp
        result = _sp.run([sys.executable, "-m", "pip", "install", "qwen-vl-utils"], capture_output=False, text=True)
        if result.returncode != 0:
            console.print("[yellow]qwen_vl_utils install failed — text extraction will still work, image extraction may not.[/yellow]")
        else:
            console.print("[green]qwen_vl_utils installed![/green]")

    # Try to download model
    console.print(f"\n[yellow]Downloading NuExtract-2.0-2B model...[/yellow]")
    console.print("[dim]This may take a few minutes on first run (~4GB download)[/dim]")

    try:
        from transformers import AutoProcessor
        try:
            from transformers import AutoModelForImageTextToText as AutoVisionModel
        except ImportError:
            from transformers import AutoModelForVision2Seq as AutoVisionModel

        console.print("[dim]Downloading processor...[/dim]")
        AutoProcessor.from_pretrained("numind/NuExtract-2.0-2B", trust_remote_code=True, padding_side="left", use_fast=True)

        console.print("[dim]Downloading model...[/dim]")
        if gpu is False:
            AutoVisionModel.from_pretrained(
                "numind/NuExtract-2.0-2B",
                trust_remote_code=True,
                torch_dtype=torch.float32,
            )
        else:
            # Use bfloat16 for download/cache — actual dtype selected at serve time
            use_dtype = torch.bfloat16 if hasattr(torch, 'bfloat16') else torch.float16
            AutoVisionModel.from_pretrained(
                "numind/NuExtract-2.0-2B",
                trust_remote_code=True,
                torch_dtype=use_dtype,
            )

        console.print("\n[green]Setup complete! Model downloaded successfully.[/green]")
        console.print("[dim]Start the server with: scrape ai.serve[/dim]")

    except Exception as e:
        console.print(f"\n[red]Setup failed: {e}[/red]")
        console.print("[dim]Check your internet connection and try again.[/dim]")


# ── 56. scrape ai.batch ──
@cli.command("ai.batch")
@click.argument("template_name", default="article")
@click.option("--server", default="http://127.0.0.1:8377", help="AI server URL")
@click.option("--output", "-o", default=None, help="Output JSONL file")
@click.option("--limit", "-n", default=50, type=int, help="Max records to process")
def ai_batch(template_name, server, output, limit):
    """Run AI extraction on all scraped text records."""
    import requests

    cfg = load_config()
    records = load_records(cfg)
    text_records = [r for r in records if r.get("type") == "text" and len(r.get("text", "")) >= 20]

    if not text_records:
        console.print("[yellow]No text records found.[/yellow]")
        return

    text_records = text_records[:limit]
    console.print(f"[yellow]Processing {len(text_records)} text records with '{template_name}' template...[/yellow]")

    templates = _get_ai_templates()
    template = templates.get(template_name, templates["article"])

    results = []
    errors = 0

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task(f"Extracting...", total=len(text_records))

        for i, rec in enumerate(text_records):
            text = rec.get("text", "")[:4000]
            try:
                resp = requests.post(f"{server}/extract", json={
                    "text": text,
                    "template": template,
                    "max_tokens": 2048,
                }, timeout=120)

                if resp.ok:
                    result = resp.json()
                    result["_source_url"] = rec.get("source_url", "")
                    result["_source_id"] = rec.get("id", "")
                    results.append(result)
                else:
                    errors += 1
            except Exception:
                errors += 1

            progress.update(task, advance=1, description=f"Extracting... {i+1}/{len(text_records)}")

    console.print(f"\n[green]Done! {len(results)} extracted, {errors} errors[/green]")

    if output:
        with open(output, "w") as f:
            for r in results:
                f.write(json.dumps(r) + "\n")
        console.print(f"[green]Results saved to {output}[/green]")
    else:
        for r in results[:5]:
            rprint(r)
            console.print()
        if len(results) > 5:
            console.print(f"[dim]... and {len(results) - 5} more. Use --output to save all.[/dim]")


# ── 57. scrape ai.templates ──
@cli.command("ai.templates")
@click.argument("template_name", default=None, required=False)
def ai_templates(template_name):
    """List available AI extraction templates, or show a specific one.

    Examples:
        scrape ai.templates          - List all templates
        scrape ai.templates article  - Show the article template
        scrape ai.templates job      - Show the job posting template
    """
    templates = _get_ai_templates()

    if template_name:
        if template_name not in templates:
            console.print(f"[red]Unknown template '{template_name}'[/red]")
            console.print(f"[dim]Available: {', '.join(templates.keys())}[/dim]")
            return
        console.print(f"\n[bold blue]{template_name}[/bold blue] template:\n")
        console.print(json.dumps(templates[template_name], indent=2))
        return

    table = Table(title="AI Extraction Templates")
    table.add_column("Template", style="cyan", no_wrap=True)
    table.add_column("Fields", style="white")
    table.add_column("Use Case", style="dim")

    use_cases = {
        "article": "News articles, blog posts, editorials",
        "product": "E-commerce product pages, listings",
        "contact": "Contact pages, directories, team pages",
        "event": "Event listings, schedules, calendars",
        "recipe": "Cooking recipes, food blogs",
        "research": "Academic papers, research articles",
        "job": "Job postings, career listings",
        "review": "Product/service reviews, ratings",
    }

    for name, tmpl in templates.items():
        fields = ", ".join(list(tmpl.keys())[:5])
        if len(tmpl) > 5:
            fields += f" (+{len(tmpl) - 5})"
        table.add_row(name, fields, use_cases.get(name, ""))

    console.print(table)
    console.print(f"\n[dim]Show template details: scrape ai.templates <name>[/dim]")
    console.print(f"[dim]Use custom JSON file:  scrape ai.extract /path/to/template.json[/dim]")


# ── 58. scrape ai.screenshot ──
@cli.command("ai.screenshot")
@click.argument("url", required=False)
@click.option("--pages", "-n", default=1, type=int, help="Number of pages to capture (auto-clicks Next)")
@click.option("--scroll/--no-scroll", default=True, help="Scroll down before capturing")
@click.option("--output", "-o", default=None, help="Output JSONL file path")
@click.option("--delay", "-d", default=3, type=int, help="Delay between pages (seconds)")
@click.option("--images/--no-images", "extract_images", default=False, help="Also extract images from screenshot")
def ai_screenshot(url, pages, scroll, output, delay, extract_images):
    """Screenshot-based text extraction for Linux (Mint, Arch + KDE/Hyprland/GNOME).

    Takes a screenshot of the current screen or a Firefox window, runs OCR to
    extract all text, saves to JSONL, deletes the screenshot, then optionally
    clicks Next and repeats.

    Requires: tesseract-ocr, python3-pil (Pillow)
    Optional: xdotool (for auto-click Next and scrolling)

    \b
    Examples:
        scrape ai.screenshot                    # Screenshot current screen
        scrape ai.screenshot --pages 5          # Capture 5 pages, auto-next
        scrape ai.screenshot --images           # Also extract images
        scrape ai.screenshot -o out.jsonl -n 10 # 10 pages to custom file
    """
    import subprocess
    import tempfile
    import time
    import json as json_mod

    try:
        from PIL import Image
    except ImportError:
        console.print("[red]Pillow not installed. Run:[/red] pip install Pillow")
        return

    # Detect screenshot tool based on desktop environment
    de = (os.environ.get("XDG_CURRENT_DESKTOP", "") or
          os.environ.get("DESKTOP_SESSION", "") or "").lower()
    wayland = os.environ.get("WAYLAND_DISPLAY", "")
    screenshot_cmd = None

    if "hyprland" in de or (wayland and shutil.which("grim")):
        screenshot_cmd = "grim"
    elif "kde" in de or "plasma" in de:
        if shutil.which("spectacle"):
            screenshot_cmd = "spectacle"
        elif shutil.which("grim"):
            screenshot_cmd = "grim"
    elif "gnome" in de or "cinnamon" in de or "mate" in de:
        if shutil.which("gnome-screenshot"):
            screenshot_cmd = "gnome-screenshot"
        elif shutil.which("grim"):
            screenshot_cmd = "grim"
    elif shutil.which("scrot"):
        screenshot_cmd = "scrot"
    elif shutil.which("grim"):
        screenshot_cmd = "grim"
    elif shutil.which("import"):
        screenshot_cmd = "import"  # ImageMagick

    if not screenshot_cmd:
        console.print("[red]No screenshot tool found.[/red]")
        console.print("Install one of: grim (Wayland), spectacle (KDE), "
                       "gnome-screenshot (GNOME/Cinnamon), scrot (X11)")
        return

    # Check for tesseract OCR
    if not shutil.which("tesseract"):
        console.print("[red]tesseract-ocr not installed.[/red]")
        console.print("Install: [bold]sudo pacman -S tesseract tesseract-data-eng[/bold] (Arch)")
        console.print("     or: [bold]sudo apt install tesseract-ocr[/bold] (Ubuntu/Mint)")
        return

    has_xdotool = shutil.which("xdotool") is not None

    cfg = load_config()
    if output is None:
        save_dir = cfg.get("save_path", os.path.join(DATA_DIR, "scraped"))
        os.makedirs(save_dir, exist_ok=True)
        output = os.path.join(save_dir, "screenshot_extract.jsonl")

    console.print(f"[blue]AI Screenshot Extraction[/blue]")
    console.print(f"  Tool: {screenshot_cmd} | DE: {de or 'unknown'}")
    console.print(f"  Pages: {pages} | Output: {output}")
    console.print(f"  Tesseract OCR: [green]found[/green]")
    if has_xdotool:
        console.print(f"  xdotool: [green]found[/green] (auto-next enabled)")
    else:
        console.print(f"  xdotool: [yellow]not found[/yellow] (manual page turning)")

    total_extracted = 0

    for page_num in range(1, pages + 1):
        console.print(f"\n[yellow]Page {page_num}/{pages}[/yellow]")

        # Scroll down first if requested
        if scroll and has_xdotool and page_num == 1:
            console.print("  Scrolling to load content...")
            for _ in range(3):
                subprocess.run(["xdotool", "key", "Page_Down"],
                               capture_output=True, timeout=5)
                time.sleep(0.5)
            subprocess.run(["xdotool", "key", "Home"],
                           capture_output=True, timeout=5)
            time.sleep(0.5)

        # Take screenshot
        tmp_path = os.path.join(tempfile.gettempdir(), f"wsp_screenshot_{page_num}.png")
        console.print(f"  Taking screenshot with {screenshot_cmd}...")

        try:
            if screenshot_cmd == "grim":
                subprocess.run(["grim", tmp_path], capture_output=True, timeout=10, check=True)
            elif screenshot_cmd == "spectacle":
                subprocess.run(["spectacle", "-b", "-n", "-f", "-o", tmp_path],
                               capture_output=True, timeout=10, check=True)
            elif screenshot_cmd == "gnome-screenshot":
                subprocess.run(["gnome-screenshot", "-f", tmp_path],
                               capture_output=True, timeout=10, check=True)
            elif screenshot_cmd == "scrot":
                subprocess.run(["scrot", tmp_path], capture_output=True, timeout=10, check=True)
            elif screenshot_cmd == "import":
                subprocess.run(["import", "-window", "root", tmp_path],
                               capture_output=True, timeout=10, check=True)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            console.print(f"  [red]Screenshot failed: {e}[/red]")
            continue

        if not os.path.exists(tmp_path):
            console.print("  [red]Screenshot file not created[/red]")
            continue

        # Run OCR with tesseract
        console.print("  Running OCR...")
        try:
            ocr_result = subprocess.run(
                ["tesseract", tmp_path, "stdout", "-l", "eng", "--psm", "3"],
                capture_output=True, text=True, timeout=60
            )
            text = ocr_result.stdout.strip()
        except subprocess.TimeoutExpired:
            console.print("  [red]OCR timed out[/red]")
            os.remove(tmp_path)
            continue

        # Extract images from screenshot if requested
        extracted_images = []
        if extract_images:
            try:
                img = Image.open(tmp_path)
                w, h = img.size
                extracted_images.append({
                    "width": w, "height": h,
                    "format": "screenshot",
                    "page": page_num,
                })
            except Exception:
                pass

        # Delete screenshot immediately
        try:
            os.remove(tmp_path)
        except OSError:
            pass

        if text:
            # Clean OCR text
            lines = [line.strip() for line in text.split("\n") if line.strip()]
            clean_text = "\n".join(lines)
            word_count = len(clean_text.split())
            total_extracted += word_count

            record = {
                "type": "screenshot_extract",
                "text": clean_text,
                "word_count": word_count,
                "page": page_num,
                "source_url": url or "screenshot",
                "extraction_method": "tesseract_ocr",
                "desktop_env": de or "unknown",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            if extracted_images:
                record["images"] = extracted_images

            with open(output, "a", encoding="utf-8") as f:
                f.write(json_mod.dumps(record, ensure_ascii=False) + "\n")

            console.print(f"  [green]Extracted {word_count} words ({len(lines)} lines)[/green]")
        else:
            console.print("  [yellow]No text found in screenshot[/yellow]")

        # Click next page if more pages to go
        if page_num < pages and has_xdotool:
            console.print("  Looking for Next button...")
            # Scroll down to find navigation
            for _ in range(5):
                subprocess.run(["xdotool", "key", "Page_Down"],
                               capture_output=True, timeout=5)
                time.sleep(0.3)

            # Try common next button patterns via keyboard
            # Tab through links and look for "Next" (best-effort)
            subprocess.run(["xdotool", "key", "End"],
                           capture_output=True, timeout=5)
            time.sleep(0.5)
            # Use xdotool to search and click "Next" or ">" text
            # Try clicking a likely next button area (right side of page, bottom)
            try:
                # Get screen dimensions
                scr = subprocess.run(
                    ["xdotool", "getdisplaygeometry"],
                    capture_output=True, text=True, timeout=5
                )
                if scr.returncode == 0:
                    dims = scr.stdout.strip().split()
                    if len(dims) == 2:
                        sw, sh = int(dims[0]), int(dims[1])
                        # Click near bottom-right where Next usually is
                        subprocess.run(
                            ["xdotool", "mousemove", str(sw * 3 // 4), str(sh * 4 // 5),
                             "click", "1"],
                            capture_output=True, timeout=5
                        )
            except Exception:
                pass

            console.print(f"  Waiting {delay}s for page load...")
            time.sleep(delay)

    console.print(f"\n[green]Done! Extracted {total_extracted} total words from {pages} page(s)[/green]")
    console.print(f"[blue]Output: {output}[/blue]")


# ── 59. scrape images.export ──
@cli.command("images.export")
@click.argument("format", default="png", type=click.Choice(["png", "webp", "jpeg", "bmp"]))
@click.option("--output-dir", "-o", default=None, help="Output directory")
@click.option("--quality", "-q", default=92, type=int, help="Quality (1-100) for lossy formats")
@click.option("--limit", "-n", default=0, type=int, help="Max images to export (0=all)")
def images_export(format, output_dir, quality, limit):
    """Export scraped images in various formats (PNG, WebP, JPEG, BMP)."""
    try:
        from PIL import Image
        import requests as req_lib
        from io import BytesIO
    except ImportError:
        console.print("[red]Pillow not installed. Run:[/red] pip install Pillow")
        return

    cfg = load_config()
    records = load_records(cfg)
    image_records = [r for r in records if r.get("type") == "image" and r.get("src")]

    if not image_records:
        console.print("[yellow]No image records found.[/yellow]")
        return

    if limit > 0:
        image_records = image_records[:limit]

    if output_dir is None:
        output_dir = os.path.join(cfg.get("save_path", os.path.join(DATA_DIR, "scraped")), "images")
    os.makedirs(output_dir, exist_ok=True)

    console.print(f"[yellow]Exporting {len(image_records)} images as {format.upper()}...[/yellow]")

    exported = 0
    errors = 0

    ext_map = {"png": ".png", "webp": ".webp", "jpeg": ".jpg", "bmp": ".bmp"}
    ext = ext_map[format]

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task("Exporting...", total=len(image_records))

        for i, rec in enumerate(image_records):
            src = rec["src"]
            try:
                # Download image
                resp = req_lib.get(src, timeout=15, headers={"User-Agent": "WebScraperPro/1.0"})
                if resp.status_code != 200:
                    errors += 1
                    progress.update(task, advance=1)
                    continue

                img = Image.open(BytesIO(resp.content))

                # Convert mode for format compatibility
                if format in ("jpeg", "bmp") and img.mode in ("RGBA", "P", "LA"):
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    bg.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
                    img = bg
                elif format == "jpeg" and img.mode != "RGB":
                    img = img.convert("RGB")

                # Generate filename
                alt = rec.get("alt", "")
                if alt:
                    name = alt.replace(" ", "_")[:80]
                else:
                    name = os.path.splitext(os.path.basename(src.split("?")[0]))[0][:80]
                name = "".join(c if c.isalnum() or c in "_-." else "_" for c in name) or "image"
                name = f"{name}_{i}{ext}"

                filepath = os.path.join(output_dir, name)

                # Save
                save_kwargs = {}
                if format in ("webp", "jpeg"):
                    save_kwargs["quality"] = quality
                if format == "webp":
                    save_kwargs["method"] = 4

                img.save(filepath, **save_kwargs)
                exported += 1

            except Exception as e:
                errors += 1

            progress.update(task, advance=1, description=f"Exporting... {i+1}/{len(image_records)}")

    console.print(f"\n[green]Exported {exported} images to {output_dir}[/green]")
    if errors:
        console.print(f"[yellow]{errors} images failed[/yellow]")

    log_history("images.export", f"Exported {exported} images as {format}")


# ══════════════════════════════════════════
# New Commands (v0.6.6.1)
# ══════════════════════════════════════════

# ── scrape diff ──
@cli.command("diff")
@click.argument("target_url")
def diff_url(target_url):
    """Compare current page content to last scrape of that URL."""
    import requests as req_lib
    from bs4 import BeautifulSoup
    import difflib

    cfg = load_config()
    records = load_records(cfg)

    # Find last scraped text for this URL
    old_texts = [r.get("text", "") for r in records
                 if r.get("source_url") == target_url and r.get("type") == "text"]

    if not old_texts:
        console.print(f"[yellow]No previous scrape found for {target_url}[/yellow]")
        console.print("[dim]Scrape it first with: scrape url " + target_url + "[/dim]")
        return

    # Fetch current
    try:
        resp = req_lib.get(target_url, timeout=30, headers={"User-Agent": "WebScraperPro/1.0"})
        soup = BeautifulSoup(resp.text, "html.parser")
        new_texts = [tag.get_text(strip=True) for tag in
                     soup.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li"])
                     if tag.get_text(strip=True) and len(tag.get_text(strip=True)) > 5]
    except Exception as e:
        console.print(f"[red]Failed to fetch {target_url}: {e}[/red]")
        return

    old_combined = "\n".join(old_texts)
    new_combined = "\n".join(new_texts)

    if old_combined == new_combined:
        console.print(f"[green]No changes detected for {target_url}[/green]")
        return

    diff = difflib.unified_diff(
        old_combined.splitlines(), new_combined.splitlines(),
        fromfile="last_scrape", tofile="current", lineterm=""
    )
    diff_lines = list(diff)

    added = sum(1 for l in diff_lines if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff_lines if l.startswith("-") and not l.startswith("---"))

    console.print(f"[bold]Changes for {target_url}:[/bold]")
    console.print(f"  [green]+{added} added[/green]  [red]-{removed} removed[/red]\n")

    for line in diff_lines[:100]:
        if line.startswith("+") and not line.startswith("+++"):
            console.print(f"[green]{line}[/green]")
        elif line.startswith("-") and not line.startswith("---"):
            console.print(f"[red]{line}[/red]")
        elif line.startswith("@@"):
            console.print(f"[cyan]{line}[/cyan]")

    if len(diff_lines) > 100:
        console.print(f"\n[dim]... and {len(diff_lines) - 100} more lines[/dim]")


# ── scrape domains ──
@cli.command("domains")
@click.option("--limit", "-n", default=50, help="Max domains to show")
def domains(limit):
    """List all scraped domains with record counts."""
    cfg = load_config()
    records = load_records(cfg)

    if not records:
        console.print("[yellow]No records.[/yellow]")
        return

    from urllib.parse import urlparse
    domain_counts = {}
    for r in records:
        url = r.get("source_url", "")
        if not url:
            continue
        try:
            d = urlparse(url).hostname
            if d:
                domain_counts[d] = domain_counts.get(d, 0) + 1
        except Exception:
            pass

    sorted_domains = sorted(domain_counts.items(), key=lambda x: x[1], reverse=True)

    table = Table(title=f"Scraped Domains ({len(sorted_domains)} total)")
    table.add_column("#", style="dim", width=4)
    table.add_column("Domain", style="cyan")
    table.add_column("Records", style="white", justify="right")
    table.add_column("Bar", style="green")

    max_count = sorted_domains[0][1] if sorted_domains else 1
    for i, (domain, count) in enumerate(sorted_domains[:limit], 1):
        bar_len = int((count / max_count) * 30)
        bar = "█" * bar_len
        table.add_row(str(i), domain, str(count), bar)

    console.print(table)
    if len(sorted_domains) > limit:
        console.print(f"[dim]Showing {limit} of {len(sorted_domains)} domains. Use --limit to show more.[/dim]")


# ── scrape sitemap ──
@cli.command("sitemap")
@click.argument("target_url")
@click.option("--limit", "-n", default=50, help="Max URLs to show")
def sitemap(target_url, limit):
    """Discover URLs from a site's sitemap.xml."""
    import requests as req_lib
    from urllib.parse import urlparse

    parsed = urlparse(target_url)
    base = f"{parsed.scheme}://{parsed.hostname}"
    sitemap_urls = [
        target_url if "sitemap" in target_url.lower() else base + "/sitemap.xml",
        base + "/sitemap_index.xml",
        base + "/sitemap.xml.gz",
    ]

    found_urls = []
    for sm_url in sitemap_urls:
        try:
            resp = req_lib.get(sm_url, timeout=15, headers={"User-Agent": "WebScraperPro/1.0"})
            if resp.ok and "<url" in resp.text.lower():
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(resp.text, "xml")
                locs = soup.find_all("loc")
                for loc in locs:
                    if loc.string:
                        found_urls.append(loc.string.strip())
                if found_urls:
                    console.print(f"[green]Found sitemap at {sm_url}[/green]")
                    break
        except Exception:
            continue

    if not found_urls:
        console.print(f"[yellow]No sitemap found for {base}[/yellow]")
        console.print("[dim]Tried: " + ", ".join(sitemap_urls) + "[/dim]")
        return

    console.print(f"\n[bold]Found {len(found_urls)} URLs in sitemap:[/bold]\n")
    for i, url in enumerate(found_urls[:limit], 1):
        console.print(f"  {i:4d}. {url}")

    if len(found_urls) > limit:
        console.print(f"\n[dim]... and {len(found_urls) - limit} more. Use --limit to show all.[/dim]")

    console.print(f"\n[dim]Scrape all with: scrape url <URL> for each, or add to queue in the extension.[/dim]")


# ── scrape robots ──
@cli.command("robots")
@click.argument("target_url")
def robots(target_url):
    """Check robots.txt rules for a URL."""
    import requests as req_lib
    from urllib.parse import urlparse

    parsed = urlparse(target_url if target_url.startswith("http") else "https://" + target_url)
    robots_url = f"{parsed.scheme}://{parsed.hostname}/robots.txt"

    try:
        resp = req_lib.get(robots_url, timeout=10, headers={"User-Agent": "WebScraperPro/1.0"})
        if not resp.ok:
            console.print(f"[yellow]No robots.txt found at {robots_url} (status {resp.status_code})[/yellow]")
            console.print("[green]No restrictions detected.[/green]")
            return

        console.print(f"[bold]robots.txt for {parsed.hostname}:[/bold]\n")

        lines = resp.text.splitlines()
        current_agent = None
        relevant = False

        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                if stripped.startswith("#"):
                    console.print(f"[dim]{stripped}[/dim]")
                continue

            if stripped.lower().startswith("user-agent:"):
                agent = stripped.split(":", 1)[1].strip()
                current_agent = agent
                relevant = agent == "*" or "scraper" in agent.lower() or "bot" in agent.lower()
                style = "bold cyan" if relevant else "dim"
                console.print(f"[{style}]{stripped}[/{style}]")
            elif stripped.lower().startswith("disallow:"):
                path = stripped.split(":", 1)[1].strip()
                if relevant and path:
                    # Check if our target URL is disallowed
                    target_path = parsed.path or "/"
                    blocked = target_path.startswith(path)
                    style = "red" if blocked else "yellow"
                    console.print(f"  [{style}]{stripped}[/{style}]" +
                                  (" [red]<-- BLOCKED[/red]" if blocked else ""))
                else:
                    console.print(f"  [dim]{stripped}[/dim]")
            elif stripped.lower().startswith("allow:"):
                console.print(f"  [green]{stripped}[/green]")
            elif stripped.lower().startswith("sitemap:"):
                console.print(f"[blue]{stripped}[/blue]")
            elif stripped.lower().startswith("crawl-delay:"):
                delay = stripped.split(":", 1)[1].strip()
                console.print(f"[yellow]{stripped}[/yellow]")
            else:
                console.print(f"[dim]{stripped}[/dim]")

    except Exception as e:
        console.print(f"[red]Error fetching robots.txt: {e}[/red]")


# ── scrape headers ──
@cli.command("headers")
@click.argument("target_url")
def headers(target_url):
    """Show HTTP response headers for a URL."""
    import requests as req_lib

    if not target_url.startswith(("http://", "https://")):
        target_url = "https://" + target_url

    try:
        resp = req_lib.head(target_url, timeout=15, allow_redirects=True,
                            headers={"User-Agent": "WebScraperPro/1.0"})

        table = Table(title=f"HTTP Headers: {target_url}")
        table.add_column("Header", style="cyan")
        table.add_column("Value", style="white")

        for key, value in sorted(resp.headers.items()):
            # Highlight security headers
            style = "green" if key.lower() in ("strict-transport-security", "content-security-policy",
                                                "x-frame-options", "x-content-type-options") else "white"
            table.add_row(key, f"[{style}]{value[:120]}[/{style}]")

        table.add_row("---", "---")
        table.add_row("Status Code", str(resp.status_code))
        table.add_row("Final URL", resp.url)
        table.add_row("Redirects", str(len(resp.history)))

        console.print(table)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


# ── scrape extract.emails ──
@cli.command("extract.emails")
@click.option("--output", "-o", default=None, help="Output file")
def extract_emails(output):
    """Extract all email addresses from scraped data."""
    import re

    cfg = load_config()
    records = load_records(cfg)

    if not records:
        console.print("[yellow]No records to search.[/yellow]")
        return

    email_pattern = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
    emails = set()

    for r in records:
        searchable = json.dumps(r)
        found = email_pattern.findall(searchable)
        emails.update(found)

    if not emails:
        console.print("[yellow]No email addresses found in scraped data.[/yellow]")
        return

    sorted_emails = sorted(emails)

    if output:
        with open(output, "w") as f:
            for email in sorted_emails:
                f.write(email + "\n")
        console.print(f"[green]Saved {len(sorted_emails)} emails to {output}[/green]")
    else:
        console.print(f"[bold]Found {len(sorted_emails)} unique email addresses:[/bold]\n")
        for email in sorted_emails:
            console.print(f"  {email}")

    log_history("extract.emails", f"Found {len(sorted_emails)} emails")


# ── scrape extract.phones ──
@cli.command("extract.phones")
@click.option("--output", "-o", default=None, help="Output file")
def extract_phones(output):
    """Extract phone numbers from scraped data."""
    import re

    cfg = load_config()
    records = load_records(cfg)

    if not records:
        console.print("[yellow]No records to search.[/yellow]")
        return

    # Common phone patterns: +1-xxx-xxx-xxxx, (xxx) xxx-xxxx, xxx.xxx.xxxx, etc.
    phone_pattern = re.compile(
        r'(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
        r'|\+\d{1,3}[-.\s]?\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}'
    )
    phones = set()

    for r in records:
        text = r.get("text", "") or ""
        found = phone_pattern.findall(text)
        phones.update(found)

    if not phones:
        console.print("[yellow]No phone numbers found in scraped data.[/yellow]")
        return

    sorted_phones = sorted(phones)

    if output:
        with open(output, "w") as f:
            for phone in sorted_phones:
                f.write(phone + "\n")
        console.print(f"[green]Saved {len(sorted_phones)} phone numbers to {output}[/green]")
    else:
        console.print(f"[bold]Found {len(sorted_phones)} phone numbers:[/bold]\n")
        for phone in sorted_phones:
            console.print(f"  {phone}")

    log_history("extract.phones", f"Found {len(sorted_phones)} phones")


# ── scrape count ──
@cli.command("count")
def count():
    """Count records by type."""
    cfg = load_config()
    records = load_records(cfg)

    if not records:
        console.print("[yellow]No records.[/yellow]")
        return

    counts = {}
    for r in records:
        rtype = r.get("type", "unknown")
        counts[rtype] = counts.get(rtype, 0) + 1

    table = Table(title="Record Counts")
    table.add_column("Type", style="cyan")
    table.add_column("Count", style="white", justify="right")
    table.add_column("Percentage", style="dim")

    total = len(records)
    for rtype, cnt in sorted(counts.items(), key=lambda x: x[1], reverse=True):
        pct = f"{cnt / total * 100:.1f}%"
        table.add_row(rtype, str(cnt), pct)

    table.add_row("─" * 10, "─" * 5, "─" * 5)
    table.add_row("[bold]Total[/bold]", f"[bold]{total}[/bold]", "100%")

    console.print(table)


# ── scrape top ──
@cli.command("top")
@click.argument("n", default=10, type=int)
def top(n):
    """Show top N most-scraped domains."""
    cfg = load_config()
    records = load_records(cfg)

    if not records:
        console.print("[yellow]No records.[/yellow]")
        return

    from urllib.parse import urlparse
    domain_counts = {}
    for r in records:
        url = r.get("source_url", "")
        try:
            d = urlparse(url).hostname
            if d:
                domain_counts[d] = domain_counts.get(d, 0) + 1
        except Exception:
            pass

    sorted_domains = sorted(domain_counts.items(), key=lambda x: x[1], reverse=True)[:n]

    console.print(f"\n[bold]Top {min(n, len(sorted_domains))} domains:[/bold]\n")
    max_count = sorted_domains[0][1] if sorted_domains else 1

    for i, (domain, cnt) in enumerate(sorted_domains, 1):
        bar_len = int((cnt / max_count) * 40)
        bar = "█" * bar_len
        console.print(f"  {i:3d}. {domain:40s} {cnt:6d}  [green]{bar}[/green]")


# ── scrape tag ──
@cli.command("tag")
@click.argument("field")
@click.argument("value")
@click.option("--tag-name", "-t", required=True, help="Tag name to apply")
@click.option("--output", "-o", default=None, help="Output file for tagged records")
def tag(field, value, tag_name, output):
    """Tag/annotate records matching a field value."""
    cfg = load_config()
    records = load_records(cfg)

    if not records:
        console.print("[yellow]No records.[/yellow]")
        return

    tagged = 0
    tagged_records = []
    for r in records:
        if value.lower() in str(r.get(field, "")).lower():
            r["_tag"] = tag_name
            tagged += 1
            tagged_records.append(r)

    if tagged == 0:
        console.print(f"[yellow]No records match {field}={value}[/yellow]")
        return

    if output:
        with open(output, "w") as f:
            for r in tagged_records:
                f.write(json.dumps(r) + "\n")
        console.print(f"[green]Tagged {tagged} records with '{tag_name}' -> {output}[/green]")
    else:
        console.print(f"[green]Found {tagged} records matching {field}={value}[/green]")
        for r in tagged_records[:5]:
            content = r.get("text", r.get("src", r.get("href", "")))[:80]
            console.print(f"  [{tag_name}] {r.get('type', '?'):6s} {content}")
        if tagged > 5:
            console.print(f"  [dim]... and {tagged - 5} more. Use --output to save all.[/dim]")

    log_history("tag", f"Tagged {tagged} records as '{tag_name}' where {field}={value}")


# ── scrape sample ──
@cli.command("sample")
@click.argument("n", default=5, type=int)
@click.option("--type", "-t", "record_type", default=None, help="Filter by type")
def sample(n, record_type):
    """Show N random records from scraped data."""
    import random

    cfg = load_config()
    records = load_records(cfg)

    if record_type:
        records = [r for r in records if r.get("type") == record_type]

    if not records:
        console.print("[yellow]No records found.[/yellow]")
        return

    samples = random.sample(records, min(n, len(records)))

    console.print(f"[bold]Random sample ({len(samples)} of {len(records)} records):[/bold]\n")

    for i, r in enumerate(samples, 1):
        rtype = r.get("type", "?")
        source = r.get("source_url", "")[:60]
        console.print(f"[bold cyan]── Record {i} ({rtype}) ──[/bold cyan]")
        console.print(f"  Source: [dim]{source}[/dim]")

        if rtype == "text":
            text = r.get("text", "")
            if len(text) > 200:
                text = text[:200] + "..."
            console.print(f"  {text}")
        elif rtype == "image":
            console.print(f"  Image: {r.get('src', '?')[:80]}")
            console.print(f"  Alt: {r.get('alt', 'none')}")
        elif rtype == "link":
            console.print(f"  URL: {r.get('href', '?')[:80]}")
            console.print(f"  Text: {r.get('text', 'none')}")
        elif rtype == "audio":
            console.print(f"  Audio: {r.get('src', '?')[:80]}")

        if r.get("citation_mla"):
            console.print(f"  [dim]Citation: {r['citation_mla'][:100]}[/dim]")
        console.print()


# ── scrape summary ──
@cli.command("summary")
def summary():
    """Generate a text summary of all scraped data."""
    cfg = load_config()
    records = load_records(cfg)
    files = get_scraped_files(cfg)

    if not records:
        console.print("[yellow]No data to summarize.[/yellow]")
        return

    from urllib.parse import urlparse
    from collections import Counter

    types = Counter(r.get("type", "unknown") for r in records)
    domains = Counter()
    total_words = 0
    date_range = [None, None]

    for r in records:
        url = r.get("source_url", "")
        try:
            d = urlparse(url).hostname
            if d:
                domains[d] += 1
        except Exception:
            pass

        if r.get("type") == "text":
            total_words += len((r.get("text", "") or "").split())

        ts = r.get("scraped_at", "")
        if ts:
            if date_range[0] is None or ts < date_range[0]:
                date_range[0] = ts
            if date_range[1] is None or ts > date_range[1]:
                date_range[1] = ts

    total_size = sum(os.path.getsize(f) for f in files) if files else 0

    console.print(Panel(
        f"[bold blue]WebScraper Pro Data Summary[/bold blue]\n"
        f"  Version: v{VERSION}\n\n"
        f"  [bold]Records:[/bold] {len(records):,}\n"
        f"  [bold]Data Files:[/bold] {len(files)}\n"
        f"  [bold]Total Size:[/bold] {format_bytes(total_size)}\n"
        f"  [bold]Total Words:[/bold] {total_words:,}\n"
        f"  [bold]Unique Domains:[/bold] {len(domains)}\n\n"
        f"  [bold]By Type:[/bold]\n"
        + "".join(f"    {t}: {c:,}\n" for t, c in types.most_common())
        + f"\n  [bold]Top 5 Domains:[/bold]\n"
        + "".join(f"    {d}: {c:,}\n" for d, c in domains.most_common(5))
        + f"\n  [bold]Date Range:[/bold]\n"
        f"    First: {(date_range[0] or 'N/A')[:19]}\n"
        f"    Last:  {(date_range[1] or 'N/A')[:19]}",
        title="Data Summary",
        border_style="blue"
    ))


# ── scrape env ──
@cli.command("env")
def env():
    """Show environment and configuration diagnostics."""
    table = Table(title="Environment Diagnostics")
    table.add_column("Key", style="cyan")
    table.add_column("Value", style="white")

    import platform as plat

    table.add_row("WebScraper Pro", f"v{VERSION}")
    table.add_row("Python", sys.version.split()[0])
    table.add_row("Python Path", sys.executable)
    table.add_row("Platform", plat.platform())
    table.add_row("Architecture", plat.machine())
    table.add_row("OS", f"{plat.system()} {plat.release()}")

    table.add_row("─" * 15, "─" * 40)
    table.add_row("Config Dir", get_config_dir())
    table.add_row("Data Dir", get_data_dir())
    table.add_row("Config File", CONFIG_FILE)
    table.add_row("Config Exists", str(os.path.exists(CONFIG_FILE)))

    cfg = load_config()
    table.add_row("Save Path", cfg.get("save_path", "N/A"))
    table.add_row("Data Format", cfg.get("data_format", "jsonl"))
    table.add_row("HF Repo", cfg.get("hf_repo_id") or "Not configured")
    table.add_row("HF Token", ("Set (" + cfg["hf_token"][:4] + "...)")
                  if cfg.get("hf_token") else "Not set")

    table.add_row("─" * 15, "─" * 40)

    # Check key tools
    for tool in ["git", "firefox", "ffmpeg", "curl"]:
        path = shutil.which(tool)
        table.add_row(tool, path or "[yellow]not found[/yellow]")

    # Venv info
    venv = os.environ.get("VIRTUAL_ENV", "")
    table.add_row("Virtual Env", venv or "None")

    # PATH
    path_entries = os.environ.get("PATH", "").split(os.pathsep)
    local_bin = os.path.join(os.path.expanduser("~"), ".local", "bin")
    table.add_row("~/.local/bin in PATH", "Yes" if local_bin in path_entries else "[yellow]No[/yellow]")

    console.print(table)


# ── Entry point ──
if __name__ == "__main__":
    cli()
