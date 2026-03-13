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
VERSION = "1.0.0"

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

DEFAULT_CONFIG = {
    "save_path": os.path.join(DATA_DIR, "scraped"),
    "data_format": "jsonl",
    "hf_token": "",
    "hf_repo_id": "",
    "hf_create_repo": True,
    "hf_private": False,
    "hf_auto_upload": False,
    "auto_cite": True,
    "image_format": "png",
    "convert_audio_to_wav": True,
    "max_pages": 200,
    "delay_ms": 1500,
    "auto_scroll": True,
    "auto_next": True,
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

        # Write JSONL
        data_file = os.path.join(save_path, "data.jsonl")
        with open(data_file, "w") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

        # Generate README
        readme = generate_readme_cli(cfg, records)
        readme_file = os.path.join(save_path, "README.md")
        with open(readme_file, "w") as f:
            f.write(readme)

        # Upload
        progress.update(task, description="Uploading files...")
        api.upload_folder(
            folder_path=save_path,
            repo_id=cfg["hf_repo_id"],
            repo_type="dataset",
            commit_message=f"Update dataset - {len(records)} records",
        )

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


# ── Entry point ──
if __name__ == "__main__":
    cli()
