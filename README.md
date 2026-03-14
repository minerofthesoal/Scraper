# WebScraper Pro

A Firefox extension + Python CLI + GUI for scraping text, images, links, and audio from web pages with smart extraction, batch URL queuing, session management, rate limiting, HuggingFace upload, MLA/APA citations, and much more.

## Features

### Firefox Extension
- **Area Selection** - Click and drag to select any region of a page to scrape
- **Full Page Scrape** - Scrape the entire visible page in one click
- **Scroll & Scrape** - Scroll-first approach: scrolls to determine page length, scrapes viewport by viewport
- **Smart Extract** - Readability-inspired article body detection that finds the main content automatically
- **Auto-Scan** - Automatically detect "Next" buttons or scroll for infinite-scroll pages
- **Batch URL Queue** - Paste a list of URLs and scrape them all sequentially with progress tracking
- **Session Manager** - Save, restore, merge, and delete named scraping sessions
- **Rate Limiting** - Per-domain configurable rate limits to prevent getting blocked
- **Domain Filtering** - Allowlist/blocklist domains to control what gets scraped
- **Custom Regex Rules** - Define regex patterns for custom content extraction (ISBN, prices, etc.)
- **Dark/Light Theme** - Toggle between dark and light mode in popup and options
- **Data Preview** - Search, filter, and browse scraped records with pagination
- **Session Timer** - Track how long your scraping session has been running
- **Keyboard Shortcuts** - Alt+S (select), Alt+P (page), Alt+Shift+S (scroll), Alt+A (auto), Alt+X (stop)
- **Context Menu** - Right-click to scrape area, full page, scroll & scrape, or smart extract
- **Download Manager** - Batch download images and audio with format conversion
- **Robots.txt Checker** - Respects robots.txt directives before scraping
- **Owner Dataset** - Upload to the shared community dataset ([ray0rf1re/Site.scraped](https://huggingface.co/datasets/ray0rf1re/Site.scraped))

### Data Collection
- **Text** - Universal extraction (4 strategies: semantic tags, leaf nodes, TreeWalker, shadow DOM)
- **Images** - `<img>`, `<picture>`, CSS backgrounds, lazy-load data-src, canvas, video posters
- **Links** - `<a>` tags, onclick URLs, data-href/data-url, role="link" elements
- **Audio/Video** - `<audio>` and `<video>` elements, `<source>` children, embed/object
- **Structured Data** - JSON-LD, Open Graph, Twitter Cards, HTML tables
- **Metadata** - Author, publish date, site name, copyright via meta tags and JSON-LD
- **Content Fingerprinting** - djb2 hash-based deduplication across sessions

### Export Formats
- **JSONL** - One JSON object per line (recommended for ML)
- **JSON** - Full structured export
- **CSV** - Comma-separated values
- **XML** - Structured XML with metadata, citations, and stats

### HuggingFace Integration
- Upload datasets directly to HuggingFace Hub
- Auto-create repos (public or private)
- Upload to your own repo or [owner's shared repo](https://huggingface.co/datasets/ray0rf1re/Site.scraped)
- Auto-generate comprehensive README with dataset cards, stats, and citations
- Multiple upload strategies with exponential backoff retry
- Incremental upload support

### Citations
- Auto-generate MLA 9th and APA 7th edition citations for every source
- Detect original authors via meta tags, JSON-LD, and Open Graph
- Include citations in HF README and export files
- Source summary table with licenses and content types

### Python CLI (50+ commands)
Full command-line companion with session management, direct URL scraping, export, upload, conversion, GUI, and more.

### Full GUI (tkinter)
- Dashboard with live stats and recent history
- Scraping tab with URL entry and batch scraping
- HuggingFace configuration and upload
- Local storage management
- Citations viewer with export
- Tools: validate, merge, convert, install, update

## Installation

### Quick Install (Linux / macOS)

```bash
git clone https://github.com/minerofthesoal/Scraper.git
cd Scraper
chmod +x install.sh
./install.sh
```

### Quick Install (Windows 10/11)

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

Download the `.pkg.tar.zst` from [Releases](https://github.com/minerofthesoal/Scraper/releases) and install:
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

## Firefox Extension Setup

### Temporary (for development)
```bash
scrape install.temp
```
Or manually:
1. Open Firefox, go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `extension/manifest.json`

### Permanent (from built .xpi)
```bash
scrape install.perm
```

## CLI Commands

### Session Management
| Command | Description |
|---------|-------------|
| `scrape start [DELAY]` | Start scraping session |
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

### Data Export & Upload
| Command | Description |
|---------|-------------|
| `scrape export [FORMAT]` | Export data (jsonl/json/csv/xml) |
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
| `scrape backup` | Create backup zip |
| `scrape restore FILE` | Restore from backup |

### System
| Command | Description |
|---------|-------------|
| `scrape doctor` | Check system health |
| `scrape env` | Show environment info |
| `scrape history` | Show scraping history |
| `scrape serve [PORT]` | Start local web viewer |
| `scrape --version` | Show version |

## Project Structure

```
Scraper/
├── .github/workflows/       # CI/CD
│   ├── build.yml            # Build, test, release
│   └── lint.yml             # Lint and validate
├── extension/               # Firefox extension
│   ├── manifest.json
│   ├── popup/               # Popup menu UI (tabbed, themed)
│   ├── options/             # Full options page
│   ├── content/             # Content scripts
│   │   ├── selector.js      # Area selection with live counter
│   │   ├── scraper.js       # Universal data extraction
│   │   ├── smart_extract.js # Article body detection & regex
│   │   ├── auto_scan.js     # Auto-pagination (scroll-first)
│   │   ├── download_manager.js  # Batch downloads
│   │   ├── robots_checker.js    # robots.txt compliance
│   │   └── overlay.css
│   ├── background/          # Background scripts
│   ├── lib/                 # Shared libraries
│   │   ├── utils.js         # Utilities, formatters
│   │   ├── mla_citation.js  # MLA 9th + APA 7th citations
│   │   ├── hf_upload.js     # HuggingFace API integration
│   │   ├── rate_limiter.js  # Per-domain rate limiting
│   │   └── session_manager.js # Sessions, queue, domain filter
│   └── icons/
├── cli/                     # Python CLI + GUI
│   ├── scrape.py            # CLI (50+ commands)
│   ├── gui.py               # Full tkinter GUI (7 tabs)
│   └── setup.py
├── packaging/
│   └── arch/PKGBUILD        # Arch Linux native package
├── install.sh               # Linux/macOS installer
├── install.bat              # Windows installer
├── install.py               # Cross-platform installer
├── LICENSE                  # Uni-S License
└── README.md
```

## Owner's Shared Dataset

Community-scraped data is uploaded to:
**[ray0rf1re/Site.scraped](https://huggingface.co/datasets/ray0rf1re/Site.scraped)**

Enable this in settings or use:
```bash
scrape upload.owner
```

## License

**Uni-S License** (Universal Scraping License) - see [LICENSE](LICENSE) for full text.

**TL;DR:**

| What | Rule |
|------|------|
| **Software code** | Open source forever. Use, modify, share freely. Must stay open source. Must attribute. |
| **Scraped data** | We own NONE of it. Original creators own everything. You are responsible for legal compliance. Cite your sources. |
| **Community dataset** | Same rules — all rights belong to original content creators. |
| **Citations** | Auto-generated to help you attribute, not a grant of rights. Verify before publishing. |
