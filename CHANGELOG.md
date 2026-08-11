# Changelog

All notable changes to WebScraper Pro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.3] - 2025-01-XX

### 🎉 Added

- **Complete Multi-Page HTML Export** - Export all captured pages into a single self-contained HTML file
  - Each page embedded as an iframe using data URLs for complete offline viewing
  - Sticky navigation header with quick links to all captured pages
  - Collapsible sections for each page with "View Captured HTML" toggle
  - Displays page meta title, source URL, and scrape timestamp
  - Professional UI with modern styling and responsive design

- **Simultaneous Multi-Tab Scraping** - All tabs now scraped in parallel
  - Configuration passthrough (captureFullHTML, scrapeJS, scrapeVideo, allowYouTube) to each tab
  - Individual success/failure tracking per tab
  - Detailed progress reporting: "Finished scraping X/Y tabs (Z failed)"
  - Proper error handling with console logging

- **"Capture Full HTML" Checkbox** - New UI option in popup
  - Toggle complete HTML capture including all CSS, JavaScript, and base elements
  - Persists selection across sessions
  - Works seamlessly with multi-tab scraping

- **GitHub Actions: Build & Release Pipeline** - Automated build and deployment
  - Triggers automatically on version bump in manifest.json
  - Manual trigger option from Actions tab with configurable settings
  - Builds extension (.xpi), Python CLI packages (.whl, .tar.gz), and source zip
  - Creates GitHub release with comprehensive changelog
  - **AI Token Support** for Firefox Add-ons submission
    - Supports FIREFOX_AI_TOKEN for automated AMO publishing
    - Falls back to JWT credentials or API key if AI token unavailable
    - Comprehensive error handling and status reporting

### 🔧 Fixed

- **Export Button Click Handler** - Fixed line 403-410 in popup.js
  - Now correctly reads and processes the "Capture Full HTML" checkbox state
  - Properly sends configuration to background script via EXPORT_DATA message

- **Content Script Configuration** - Enhanced scraper.js message handling
  - Added `scrapeEntireDocument(configOverride)` function accepting direct configuration
  - Ensures full HTML capture works correctly during multi-tab scraping operations
  - Proper passthrough of captureFullHTML, scrapeJS, scrapeVideo, and allowYouTube flags

- **Background Script Multi-Tab Logic** - Updated scrapeAllTabs() implementation
  - Switched from SCRAPE_FULL_PAGE to SCRAPE_DOCUMENT action
  - All configuration options now passed to each tab during parallel scraping
  - Enables simultaneous multi-tab scraping with full HTML capture enabled

### 📝 Changed

- Updated extension description in manifest.json to highlight multi-page HTML export capability
- Enhanced error messages and user feedback throughout export process
- Improved code organization and documentation in background.js and scraper.js

### 📦 Technical

- New `createFullHTMLExport()` function generates complete standalone HTML files
- Data URL embedding preserves all original page resources (CSS, JS, images)
- Parallel tab scraping reduces total processing time significantly
- GitHub workflow supports multiple authentication methods for maximum flexibility

---

## [0.8.2] - Previous Release

### Features
- Smart extraction with regex-based data extraction
- Batch queuing and session management
- GwSS visualization
- HuggingFace upload integration
- MLA/APA citation generation
- Text, image, link, audio, and video scraping

---

*For more detailed commit history, see the [Git log](https://github.com/minerofthesoal/Scraper/commits/main)*
