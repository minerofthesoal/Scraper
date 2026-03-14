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
    scrape export [FORMAT]           - Export scraped data (jsonl/json/csv)
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
    scrape -U -new                   - Update to newest version
    scrape -C option.upload          - Configure upload (dot-syntax)
    scrape --version                 - Show version
    scrape --help                    - Show this help
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
VERSION = "0.5b"

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

@click.group(invoke_without_command=True)
@click.option("--version", "-v", is_flag=True, help="Show version")
@click.pass_context
def cli(ctx, version):
    """WebScraper Pro CLI - Scraping companion tool."""
    if version:
        console.print(f"[bold blue]WebScraper Pro CLI[/bold blue] v{VERSION}")
        return
    if ctx.invoked_subcommand is None:
        console.print(Panel(
            "[bold blue]WebScraper Pro CLI[/bold blue] v" + VERSION + "\n\n"
            "Use [green]scrape --help[/green] to see all commands.\n"
            "Use [green]scrape <command> --help[/green] for command details.",
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
@click.argument("format", default="jsonl", type=click.Choice(["jsonl", "json", "csv"]))
@click.option("--output", "-o", default=None, help="Output file path")
def export_data(format, output):
    """Export scraped data in specified format."""
    cfg = load_config()
    records = load_records(cfg)

    if not records:
        console.print("[yellow]No data to export.[/yellow]")
        return

    if not output:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output = f"export_{timestamp}.{format}"

    if format == "jsonl":
        with open(output, "w") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")
    elif format == "json":
        with open(output, "w") as f:
            json.dump(records, f, indent=2)
    elif format == "csv":
        import csv
        if records:
            keys = sorted(set().union(*(r.keys() for r in records)))
            with open(output, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=keys)
                writer.writeheader()
                writer.writerows(records)

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

        # Generate README first (always uploaded)
        progress.update(task, description="Generating README...")
        readme = generate_readme_cli(cfg, records)
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
@click.option("--new", "-n", "newest", is_flag=True, help="Update to the newest version")
def update(newest):
    """Update WebScraper Pro to the newest version."""
    import subprocess
    console.print("[blue]Checking for updates...[/blue]")

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "webscraper-pro-cli"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            console.print("[green]Updated successfully![/green]")
        else:
            # Try from git
            console.print("[yellow]PyPI package not found. Trying git update...[/yellow]")
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "--upgrade",
                 "git+https://github.com/minerofthesoal/Scraper.git#subdirectory=cli"],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                console.print("[green]Updated from git successfully![/green]")
            else:
                console.print(f"[red]Update failed.[/red] {result.stderr}")
    except Exception as e:
        console.print(f"[red]Update failed: {e}[/red]")


# ══════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════

def format_bytes(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


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

This dataset was collected using [WebScraper Pro](https://github.com/minerofthesoal/Scraper), an open-source Firefox extension and CLI tool for structured web data collection with automatic pagination support.

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
    table.add_row("Python", "[green]OK[/green]", f"{sys.version.split()[0]}")

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


# ── Entry point ──
if __name__ == "__main__":
    cli()
