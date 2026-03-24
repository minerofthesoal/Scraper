# WebScraper Pro

**v0.8.0** | Firefox Extension + Python CLI + Full GUI | Android supported

A powerful, open-source web scraping toolkit that combines a Firefox browser extension with a 50+ command Python CLI and a full graphical interface. Scrape text, images, links, audio, video, and structured data with smart extraction, regex-based data extraction, batch queuing, session management, rate limiting, HuggingFace dataset upload, and automatic MLA/APA citation generation. Features GwSS interactive graph visualization, content sanitization, deobfuscation, cookie auto-dismiss, tab scraping, clipboard scraping, and auto XPI builds.

**[Homepage](https://minerofthesoal.github.io/Scraper/)** | **[Releases](https://github.com/minerofthesoal/Scraper/releases)** | **[Community Dataset](https://huggingface.co/datasets/ray0rf1re/Site.scraped)**

[![Build & Release](https://github.com/minerofthesoal/Scraper/actions/workflows/build.yml/badge.svg)](https://github.com/minerofthesoal/Scraper/actions/workflows/build.yml)
[![Lint & Validate](https://github.com/minerofthesoal/Scraper/actions/workflows/lint.yml/badge.svg)](https://github.com/minerofthesoal/Scraper/actions/workflows/lint.yml)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Installation](#installation)
- [Firefox Extension Setup](#firefox-extension-setup)
- [CLI Reference](#cli-reference)
- [GUI](#gui)
- [Project Structure](#project-structure)
- [Community Dataset](#community-dataset)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

```bash
# Clone and install (Linux/macOS)
git clone https://github.com/minerofthesoal/Scraper.git
cd Scraper && chmod +x install.sh && ./install.sh

# Or use the cross-platform Python installer
python install.py

# Verify installation
scrape --version
scrape doctor

# Start scraping
scrape start
scrape url https://example.com
scrape export jsonl
```

---

## Features

### Firefox Extension
| Feature | Description |
|---------|-------------|
| **Area Selection** | Click and drag to select any region of a page |
| **Full Page Scrape** | One-click scraping of the entire visible page |
| **Scroll & Scrape** | Viewport-by-viewport scraping after scroll detection |
| **Smart Extract** | Readability-inspired article body detection |
| **Auto-Scan** | Automatic "Next" button detection and infinite-scroll handling |
| **Batch URL Queue** | Paste a list of URLs and scrape them sequentially |
| **Session Manager** | Save, restore, merge, and delete named sessions |
| **Rate Limiting** | Per-domain configurable request limits |
| **Domain Filtering** | Allowlist/blocklist for domain control |
| **Custom Regex** | User-defined regex patterns (ISBN, prices, emails, etc.) |
| **Dark/Light Theme** | Theme toggle for popup and options pages |
| **Data Preview** | Search, filter, and paginate scraped records |
| **Session Timer** | Live elapsed-time tracker |
| **Keyboard Shortcuts** | Ctrl+Shift+S/P/L/A/X (no Firefox conflicts) |
| **Context Menu** | Right-click scraping for all modes |
| **Download Manager** | Batch download images and audio with conversion |
| **Robots.txt Checker** | Automatic robots.txt compliance checking |
| **Record Details** | Modal view with domain stats and dedup tracking |
| **Tab Scraping** | Scrape all open tabs at once |
| **Clipboard Scrape** | Scrape content directly from clipboard |
| **Cookie Auto-Dismiss** | Auto-click cookie consent banners (disabled by default) |
| **Deobfuscation** | Detect and reverse Base64, hex, ROT13, CSS-hidden text (disabled by default) |
| **Content Sanitizer** | XSS detection, URL validation, HTML sanitization |
| **GwSS Visualization** | Interactive force-directed graph of all scraped sites with live physics, favicons, unique composite edge patterns, collision avoidance, directional edge arrows, SSDg per-site data flow diagrams with timing data, SVG/PNG/CSV/JSON/GraphML export |
| **Sensitive Content Filter** | Auto-detect and redact PII, API keys, credit cards, SSNs, slurs |
| **Auto-Save** | Automatic session persistence with periodic backups |

### Data Collection

- **Text** - 4 extraction strategies: semantic tags, leaf nodes, TreeWalker, shadow DOM
- **Images** - `<img>`, `<picture>`, CSS backgrounds, lazy-load `data-src`, canvas, video posters
- **Links** - `<a>` tags, `onclick` URLs, `data-href`/`data-url`, `role="link"` elements
- **Audio** - `<audio>`, `<source>` children, `embed`/`object` audio types
- **Video** - `<video>` sources, embedded players (Vimeo, Dailymotion, etc.), `<track>` subtitles, YouTube filtering toggle
- **JS Content** - Shadow DOM, web components, `__NEXT_DATA__`/`__NUXT__` state, microdata, `<template>`, `[slot]` elements
- **Structured Data** - JSON-LD, Open Graph, Twitter Cards, HTML tables
- **Metadata** - Author, publish date, site name, copyright via meta tags and JSON-LD
- **Content Fingerprinting** - djb2 hash-based deduplication across sessions

### Export Formats

| Format | Extension | Best For |
|--------|-----------|----------|
| JSONL | `.jsonl` | Machine learning, streaming |
| JSON | `.json` | APIs, structured storage |
| CSV | `.csv` | Spreadsheets, data analysis |
| XML | `.xml` | Enterprise, interoperability |
| Markdown | `.md` | Documentation, human-readable |

Pretty-print JSON/JSONL exports are supported for human-readable output.

### HuggingFace Integration

- Direct upload to HuggingFace Hub
- Auto-create repositories (public or private)
- Upload to your own repo or the [shared community dataset](https://huggingface.co/datasets/ray0rf1re/Site.scraped)
- Auto-generate README with dataset cards, statistics, and citations
- Automatic JSONL file sharding (500KB per shard) to avoid upload size limits
- Exponential backoff retry with incremental upload support

### Citations

- Auto-generate **MLA 9th** and **APA 7th** edition citations for every source
- Detect original authors via meta tags, JSON-LD, and Open Graph
- Include citations in HuggingFace README and export files

### Local Data Extraction

- Template-based structured data extraction using local regex patterns
- 9 built-in templates: Article, Product, Contact, Event, Recipe, Research, Job, Review, All (Combined)
- Custom template support with user-defined JSON schemas
- Extracts emails, phones, names, dates, prices, addresses, companies, URLs, and more
- Batch extraction across multiple records
- No external server or AI model required

### Android Support

- Works on Firefox for Android (Fenix 120+)
- Responsive UI optimized for small screens (420px breakpoint)
- Swipe left/right to navigate between tabs
- Larger touch targets (38px buttons, 18px checkboxes)
- Scroll-snap tab navigation on touch devices

---

## Installation

### Linux / macOS

```bash
git clone https://github.com/minerofthesoal/Scraper.git
cd Scraper
chmod +x install.sh
./install.sh
```

### Windows 10/11

```batch
git clone https://github.com/minerofthesoal/Scraper.git
cd Scraper
install.bat
```

### Cross-Platform (Python)

```bash
python install.py
```

### Arch Linux (Native Package)

From [Releases](https://github.com/minerofthesoal/Scraper/releases):
```bash
sudo pacman -U webscraper-pro-*.pkg.tar.zst
```

Or build from source:
```bash
cd packaging/arch
makepkg -si
```

### Manual CLI Install

```bash
cd cli
pip install -e .
```

### Update

```bash
scrape -U
```

### Uninstall

```bash
scrape -rmv
```

---

## Firefox Extension Setup

### Temporary (Development)

```bash
scrape install.temp
```
Or manually: Firefox -> `about:debugging#/runtime/this-firefox` -> **Load Temporary Add-on** -> select `extension/manifest.json`

### Permanent (Built .xpi)

```bash
scrape install.perm
```
Or: Firefox -> `about:addons` -> gear icon -> **Install Add-on From File** -> select `webscraper-pro.xpi`

---

## CLI Reference

### Quick Flags

| Flag | Action |
|------|--------|
| `scrape -h` | Show help |
| `scrape -v` | Show version |
| `scrape -U` | Update from GitHub |
| `scrape -rmv` | Uninstall everything |

### Session Management

| Command | Description |
|---------|-------------|
| `scrape start [DELAY]` | Start scraping session (optional delay in seconds) |
| `scrape stop` | Stop active session |
| `scrape status` | Show current scraping status |
| `scrape gui.start` | Launch the full graphical interface |

### Configuration

| Command | Description |
|---------|-------------|
| `scrape config` | Show current configuration |
| `scrape config.set KEY VALUE` | Set a config value |
| `scrape config.upload` | Configure HuggingFace upload settings |
| `scrape config.save` | Configure local save settings |
| `scrape config.reset` | Reset config to defaults |
| `scrape profile NAME --save` | Save config as named profile |
| `scrape profile NAME --load` | Load a config profile |

### Scraping

| Command | Description |
|---------|-------------|
| `scrape url URL` | Scrape a URL directly from CLI |
| `scrape watch URL --every 1h` | Watch a URL for changes |
| `scrape schedule URL --every 6h` | Schedule recurring scrapes |
| `scrape sitemap URL` | Parse and scrape URLs from sitemap |
| `scrape info URL` | Show metadata for a URL |
| `scrape robots URL` | Check robots.txt for a URL |
| `scrape ping URL` | Check if a URL is reachable with timing |
| `scrape benchmark URL` | Benchmark scraping speed (fetch + parse) |

### Data Export & Upload

| Command | Description |
|---------|-------------|
| `scrape export [FORMAT]` | Export data (jsonl/json/csv/xml/md) |
| `scrape upload` | Upload to your HuggingFace repo |
| `scrape upload.new REPO_ID` | Create new HF repo and upload |
| `scrape upload.owner` | Upload to shared community repo |
| `scrape upload.status` | Check HF upload status |

### Data Management

| Command | Description |
|---------|-------------|
| `scrape stats` | Show detailed statistics |
| `scrape count --by-type` | Count records by type |
| `scrape search QUERY` | Search through scraped data |
| `scrape head [-n 10]` | Show first N records |
| `scrape tail [-n 10]` | Show last N records |
| `scrape sample [-n 5]` | Show random sample |
| `scrape dedup` | Remove duplicates |
| `scrape merge FILE [FILE...]` | Merge JSONL files |
| `scrape diff FILE1 FILE2` | Compare data files |
| `scrape filter FIELD VALUE` | Filter records by field value |
| `scrape validate` | Validate data integrity |

### Data Extraction

| Command | Description |
|---------|-------------|
| `scrape ai.extract TEMPLATE TEXT` | Extract structured data using local regex |
| `scrape ai.status` | Check extraction engine status |
| `scrape ai.batch` | Batch extraction across records |

### Build & Package

| Command | Description |
|---------|-------------|
| `scrape build.xpi` | Build the Firefox extension .xpi package |

### Image & Audio

| Command | Description |
|---------|-------------|
| `scrape images.export [FORMAT]` | Export images (PNG/WebP/BMP/JPEG) |
| `scrape convert.images [FORMAT]` | Convert images to format |
| `scrape convert.audio` | Convert audio files to .wav |
| `scrape download.images` | Batch download images |
| `scrape download.audio` | Batch download audio |

### System & Utilities

| Command | Description |
|---------|-------------|
| `scrape doctor` | Check system health and dependencies |
| `scrape env` | Show environment info |
| `scrape logs [--tail N]` | Show scraping logs and activity |
| `scrape history` | Show scraping history |
| `scrape history.search QUERY` | Search history |
| `scrape changelog` | Show version history |
| `scrape serve [PORT]` | Start local web viewer |
| `scrape backup` | Create backup zip |
| `scrape restore FILE` | Restore from backup |
| `scrape reset` | Factory reset all data and config |
| `scrape readme` | Generate HuggingFace README |
| `scrape cite` | Generate MLA citations |
| `scrape cite.export [FILE]` | Export citations to file |

---

## GUI

Launch the full graphical interface with:

```bash
scrape gui.start
```

The GUI features 7 tabs:

1. **Dashboard** - Live stats, recent history, session overview
2. **Scraping** - URL entry, batch scraping, mode selection
3. **HuggingFace** - Token config, repo selection, upload management
4. **Storage** - Local file browser, data management, export
5. **Citations** - Citation viewer with MLA/APA export
6. **Tools** - Validate, merge, convert, install, update utilities
7. **Settings** - Theme, rate limits, domain filters, profiles

---

## Project Structure

```
Scraper/
├── .github/workflows/           # CI/CD pipelines
│   ├── build.yml                # Multi-platform build, test, release
│   └── lint.yml                 # Linting and validation
├── docs/                        # GitHub Pages homepage
│   └── index.html               # Landing page
├── extension/                   # Firefox extension (Manifest V2)
│   ├── manifest.json            # Extension manifest
│   ├── popup/                   # Popup menu UI (tabbed, themed)
│   ├── options/                 # Full options page
│   ├── content/                 # Content scripts
│   │   ├── selector.js          # Area selection with live counter
│   │   ├── scraper.js           # Universal data extraction engine
│   │   ├── smart_extract.js     # Article body detection & regex rules
│   │   ├── auto_scan.js         # Auto-pagination (scroll-first)
│   │   ├── download_manager.js  # Batch downloads
│   │   ├── robots_checker.js    # robots.txt compliance
│   │   ├── deobfuscator.js     # Content deobfuscation engine
│   │   ├── cookie_dismiss.js   # Cookie consent auto-dismiss
│   │   └── overlay.css          # Selection overlay styles
│   ├── background/              # Background service worker
│   ├── lib/                     # Shared libraries
│   │   ├── utils.js             # Utilities and formatters
│   │   ├── mla_citation.js      # MLA 9th + APA 7th citation engine
│   │   ├── hf_upload.js         # HuggingFace API integration
│   │   ├── rate_limiter.js      # Per-domain rate limiting
│   │   ├── session_manager.js   # Session, queue, domain filtering
│   │   ├── image_export.js      # Image processing and export
│   │   ├── ai_extract.js        # Local regex data extraction
│   │   ├── sanitizer.js        # Content security sanitizer
│   │   └── content_filter.js   # Sensitive data filtering
│   ├── gwss/                    # GwSS visualization page
│   │   ├── gwss.html            # Graph viewer
│   │   ├── gwss.js              # Force-directed engine + SSDg
│   │   └── gwss.css             # Graph styles
│   └── icons/                   # Extension icons (auto-generated)
├── cli/                         # Python CLI + GUI
│   ├── scrape.py                # CLI with 55+ commands
│   ├── gui.py                   # Full tkinter GUI (7 tabs)
│   └── setup.py                 # Package configuration
├── packaging/
│   └── arch/PKGBUILD            # Arch Linux native package
├── install.sh                   # Linux/macOS installer
├── install.bat                  # Windows installer
├── build_xpi.sh                 # Auto XPI builder script
├── install.py                   # Cross-platform Python installer
├── LICENSE                      # Uni-S License v3.0
└── README.md
```

---

## Community Dataset

Community-scraped data is uploaded to the shared dataset:

**[ray0rf1re/Site.scraped](https://huggingface.co/datasets/ray0rf1re/Site.scraped)**

Upload your data:
```bash
scrape upload.owner
```

All rights to contributed content remain with the original creators. See the [License](#license) for details.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run validation: `scrape doctor && scrape validate`
5. Commit: `git commit -m "Add my feature"`
6. Push: `git push origin feature/my-feature`
7. Open a Pull Request

Please ensure your code passes the lint and build workflows before submitting.

---

## License

**[Uni-S License v3.0](LICENSE)** (Universal Scraping License)

| What | Rule |
|------|------|
| **Software** | Open source forever. Use, modify, distribute freely. Attribution required. Standalone scraper forks must stay open source. Library use in larger projects is unrestricted. |
| **Scraped Data** | Nobody owns scraped data by scraping it. All rights belong to original content creators. Users are solely responsible for legal compliance. |
| **Community Dataset** | Same rules. All rights belong to original content creators. Contributors are responsible for their uploads. |
| **Citations** | Auto-generated to assist with attribution. Not a grant of rights. Must be verified before publishing. |
| **AI Models** | Models trained on scraped data do not inherit rights to the training data. Original creator rights are preserved. |
| **Liability** | Software provided as-is. Authors are not liable for misuse, data loss, or legal violations by users. |

---

*Made with WebScraper Pro - [Report issues](https://github.com/minerofthesoal/Scraper/issues)*
