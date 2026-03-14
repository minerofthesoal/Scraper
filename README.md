# WebScraper Pro

A Firefox extension + Python CLI + GUI for scraping text, images, links, and audio from web pages with area selection, auto-pagination, HuggingFace upload, MLA citations, and much more.

## Features

### Firefox Extension
- **Area Selection** - Click and drag to select any region of a page to scrape
- **Full Page Scrape** - Scrape the entire visible page in one click
- **Auto-Scan** - Automatically detect "Next" buttons or scroll for infinite-scroll pages
- **Auto-Start** - Optionally auto-scrape when navigating to new pages
- **Popup Menu** - Quick access to start, stop, configure, and view live stats
- **Options Page** - Full configuration for scraping, storage, HF upload, and citations
- **Context Menu** - Right-click to scrape selected areas
- **Real-time Stats** - Track pages, texts, images, links, and audio scraped
- **Download Manager** - Batch download images and audio with format conversion
- **Robots.txt Checker** - Respects robots.txt directives before scraping
- **Owner Dataset** - Upload to the shared community dataset ([ray0rf1re/Site.scraped](https://huggingface.co/datasets/ray0rf1re/Site.scraped))

### Data Collection
- **Text** - Paragraphs, headings, lists, tables, blockquotes, code blocks
- **Images** - `<img>`, `<picture>`, CSS background images (PNG/WebP/JPG/JPEG)
- **Links** - All hyperlinks with anchor text
- **Audio/Video** - `<audio>` and `<video>` elements, converted to `.wav`
- **Metadata** - Author, publish date, site name via meta tags and JSON-LD

### HuggingFace Integration
- Upload datasets directly to HuggingFace Hub
- Auto-create repos (public or private)
- Upload to your own repo or [owner's shared repo](https://huggingface.co/datasets/ray0rf1re/Site.scraped)
- Auto-generate comprehensive README with dataset cards
- README is always uploaded first with full MLA citations
- JSONL format with full metadata

### MLA Citations
- Auto-generate MLA 9th edition citations for every source
- Detect original authors via meta tags, JSON-LD, and Open Graph
- Include citations in HF README and export files
- Cite all links and original creators

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

This installs the `scrape` command system-wide, the Firefox native messaging host, and a desktop entry for the GUI.

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
Or: download `webscraper-pro.xpi` from Releases, then in Firefox go to `about:addons` > gear icon > **Install Add-on From File**.

## CLI Commands

### Session Management
| Command | Description |
|---------|-------------|
| `scrape start [DELAY]` | Start scraping session (optional delay in seconds) |
| `scrape stop` | Stop active session |
| `scrape status` | Show current scraping status |
| `scrape gui.start` | Launch the full graphical interface |

### Configuration (dot-syntax)
| Command | Description |
|---------|-------------|
| `scrape config` | Show current configuration |
| `scrape config.set KEY VALUE` | Set a config value |
| `scrape config.upload` | Configure HuggingFace upload settings |
| `scrape config.save` | Configure local save settings |
| `scrape config.reset` | Reset config to defaults |
| `scrape profile NAME --save` | Save config as named profile |
| `scrape profile NAME --load` | Load a config profile |
| `scrape profile --list` | List all profiles |

### Scraping
| Command | Description |
|---------|-------------|
| `scrape url URL` | Scrape a URL directly from CLI |
| `scrape watch URL --every 1h` | Watch a URL for changes, scrape on change |
| `scrape schedule URL --every 6h` | Schedule recurring scrapes |
| `scrape sitemap URL` | Parse and scrape URLs from sitemap |
| `scrape info URL` | Show metadata for a URL without scraping |
| `scrape robots URL` | Check robots.txt for a URL |

### Data Export & Upload
| Command | Description |
|---------|-------------|
| `scrape export [FORMAT]` | Export data (jsonl/json/csv) |
| `scrape upload` | Upload to your HuggingFace repo (README first) |
| `scrape upload.new REPO_ID` | Create new HF repo and upload |
| `scrape upload.owner` | Upload to shared [ray0rf1re/Site.scraped](https://huggingface.co/datasets/ray0rf1re/Site.scraped) |
| `scrape upload.status` | Check HF upload status |
| `scrape readme` | Generate HF README from data |

### Data Management
| Command | Description |
|---------|-------------|
| `scrape stats` | Show detailed session statistics |
| `scrape count --by-type` | Count records by type |
| `scrape count --by-source` | Count records by source URL |
| `scrape search QUERY` | Search through scraped data |
| `scrape filter FIELD VALUE` | Filter records by field value |
| `scrape head [-n 10]` | Show first N records |
| `scrape tail [-n 10]` | Show last N records |
| `scrape sample [-n 5]` | Show random sample records |
| `scrape dedup` | Remove duplicate records |
| `scrape merge FILE [FILE...]` | Merge multiple JSONL files |
| `scrape diff FILE1 FILE2` | Compare two data files |
| `scrape validate` | Validate data integrity |
| `scrape clear` | Clear all scraped data |
| `scrape clear.cache` | Clear cache only |
| `scrape backup` | Create backup zip of all data |
| `scrape restore FILE` | Restore from backup |

### Citations
| Command | Description |
|---------|-------------|
| `scrape cite` | Generate MLA citations for all sources |
| `scrape cite.export [FILE]` | Export citations to file |

### Media Conversion
| Command | Description |
|---------|-------------|
| `scrape convert.images [FMT]` | Convert images to png/webp/jpg |
| `scrape convert.audio` | Convert audio files to .wav |
| `scrape download.images` | Download all scraped images to disk |
| `scrape download.audio` | Download all scraped audio to disk |

### Extension Management
| Command | Description |
|---------|-------------|
| `scrape install.temp` | Install extension temporarily (about:debugging) |
| `scrape install.perm` | Install extension permanently (.xpi) |

### System
| Command | Description |
|---------|-------------|
| `scrape doctor` | Check system health and dependencies |
| `scrape env` | Show environment information |
| `scrape history` | Show scraping history |
| `scrape history.search QUERY` | Search scraping history |
| `scrape serve [PORT]` | Start local web viewer |
| `scrape update` | Update to newest version |
| `scrape --version` | Show version |

## GitHub Actions

The project includes CI/CD workflows that automatically:
- **Build** the Firefox extension as `.xpi`
- **Build** the Python package (wheel + sdist)
- **Build** the Arch Linux package (`.pkg.tar.zst`)
- **Test** the CLI across Python 3.9-3.12
- **Validate** the extension manifest and file references
- **Release** all artifacts when a version tag is pushed

## Data Format

Scraped data is saved as JSONL with full metadata:

```json
{
  "id": "unique-id",
  "type": "text",
  "text": "Scraped content here",
  "tag": "p",
  "source_url": "https://example.com/article",
  "source_title": "Article Title",
  "author": "John Doe",
  "site_name": "example.com",
  "scraped_at": "2024-01-01T12:00:00Z",
  "citation_mla": "Doe, John. \"Article Title.\" *example.com*, https://example.com/article. Accessed 1 Jan. 2024."
}
```

## Project Structure

```
Scraper/
├── .github/workflows/       # CI/CD
│   ├── build.yml            # Build, test, release
│   └── lint.yml             # Lint and validate
├── extension/               # Firefox extension
│   ├── manifest.json
│   ├── popup/               # Popup menu UI
│   ├── options/             # Full options page
│   ├── content/             # Content scripts
│   │   ├── selector.js      # Area selection
│   │   ├── scraper.js       # Data extraction
│   │   ├── auto_scan.js     # Auto-pagination
│   │   ├── download_manager.js  # Batch downloads
│   │   ├── robots_checker.js    # robots.txt compliance
│   │   └── overlay.css
│   ├── background/          # Background scripts
│   ├── lib/                 # Shared libraries (utils, MLA, HF upload)
│   └── icons/
├── cli/                     # Python CLI + GUI
│   ├── scrape.py            # CLI (50+ commands)
│   ├── gui.py               # Full tkinter GUI
│   └── setup.py
├── packaging/
│   └── arch/PKGBUILD        # Arch Linux native package
├── install.sh               # Linux/macOS installer
├── install.bat              # Windows installer
├── install.py               # Cross-platform installer
├── LICENSE
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

MIT License - see [LICENSE](LICENSE) for details.
