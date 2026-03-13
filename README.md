# WebScraper Pro

A Firefox extension + Python CLI for scraping text, images, links, and audio from web pages with area selection, auto-pagination, HuggingFace upload, and MLA citation support.

## Features

### Firefox Extension
- **Area Selection** - Click and drag to select a specific area of any page to scrape
- **Full Page Scrape** - Scrape the entire visible page in one click
- **Auto-Scan** - Automatically detect "Next" buttons or scroll for infinite-scroll pages
- **Auto-Start** - Optionally auto-scrape when navigating to new pages
- **Popup Menu** - Quick access to start, stop, configure, and view stats
- **Options Page** - Full configuration for scraping, storage, HF upload, and citations
- **Context Menu** - Right-click to scrape selected areas
- **Real-time Stats** - Track pages, texts, images, links, and audio scraped

### Data Collection
- **Text** - Paragraphs, headings, lists, tables, blockquotes, code blocks
- **Images** - `<img>`, `<picture>`, CSS background images (PNG/WebP/JPG/JPEG)
- **Links** - All hyperlinks with anchor text
- **Audio/Video** - `<audio>` and `<video>` elements, converted to `.wav`
- **Metadata** - Author, publish date, site name via meta tags and JSON-LD

### HuggingFace Integration
- Upload datasets directly to HuggingFace Hub
- Auto-create repos (public or private)
- Upload to your own repo or extension owner's shared repo
- Auto-generate comprehensive README with dataset cards
- JSONL format with full metadata

### MLA Citations
- Auto-generate MLA 9th edition citations for every source
- Detect original authors via meta tags, JSON-LD, and Open Graph
- Include citations in HF README and export files
- Cite all links and original creators

### Python CLI (20+ commands)
Full command-line companion with session management, export, upload, conversion, and more.

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

### Manual CLI Install

```bash
cd cli
pip install -e .
```

## Firefox Extension Setup

1. Open Firefox
2. Navigate to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select `extension/manifest.json`

## CLI Commands

| Command | Description |
|---------|-------------|
| `scrape start [DELAY]` | Start scraping session (optional delay in seconds) |
| `scrape stop` | Stop active session |
| `scrape status` | Show current scraping status |
| `scrape config` | Show current configuration |
| `scrape config.set KEY VALUE` | Set a config value |
| `scrape config.upload` | Configure HuggingFace upload settings |
| `scrape config.save` | Configure local save settings |
| `scrape config.reset` | Reset config to defaults |
| `scrape export [FORMAT]` | Export data (jsonl/json/csv) |
| `scrape upload` | Upload data to HuggingFace |
| `scrape upload.new REPO_ID` | Create new HF repo and upload |
| `scrape upload.status` | Check HF upload status |
| `scrape cite` | Generate MLA citations for all sources |
| `scrape cite.export [FILE]` | Export citations to file |
| `scrape convert.images [FMT]` | Convert images to png/webp/jpg |
| `scrape convert.audio` | Convert audio files to .wav |
| `scrape stats` | Show detailed session statistics |
| `scrape clear` | Clear all scraped data |
| `scrape clear.cache` | Clear cache only |
| `scrape history` | Show scraping history |
| `scrape history.search QUERY` | Search scraping history |
| `scrape serve [PORT]` | Start local web viewer |
| `scrape merge FILE [FILE...]` | Merge multiple JSONL files |
| `scrape filter FIELD VALUE` | Filter records by field value |
| `scrape readme` | Generate HF README from data |
| `scrape validate` | Validate data integrity |
| `scrape update` | Update to newest version |
| `scrape --version` | Show version |

### Dot-syntax Config

```bash
scrape -C option.upload    # Same as: scrape config.upload
scrape config.set hf_token "hf_xxxx"
scrape config.set hf_repo_id "user/my-dataset"
```

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
├── extension/               # Firefox extension
│   ├── manifest.json        # Extension manifest
│   ├── popup/               # Popup menu UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── options/             # Full options page
│   │   ├── options.html
│   │   ├── options.css
│   │   └── options.js
│   ├── content/             # Content scripts
│   │   ├── selector.js      # Area selection
│   │   ├── scraper.js       # Data extraction
│   │   ├── auto_scan.js     # Auto-pagination
│   │   └── overlay.css      # Selection overlay styles
│   ├── background/          # Background scripts
│   │   └── background.js    # Data management & HF upload
│   ├── lib/                 # Shared libraries
│   │   ├── utils.js         # Utility functions
│   │   ├── mla_citation.js  # MLA citation generator
│   │   └── hf_upload.js     # HuggingFace API client
│   └── icons/               # Extension icons
├── cli/                     # Python CLI
│   ├── scrape.py            # CLI tool (20+ commands)
│   └── setup.py             # Package setup
├── install.sh               # Linux/macOS installer
├── install.bat              # Windows installer
├── install.py               # Cross-platform Python installer
├── LICENSE
└── README.md
```

## License

MIT License - see [LICENSE](LICENSE) for details.
