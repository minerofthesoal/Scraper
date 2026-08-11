# Changelog

All notable changes to WebScraper Pro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.4] - 2025-01-XX

### 🎉 Added

- **Minimalistic Dark/Light Theme** - Auto-detects and adapts to device theme preference
  - CSS custom properties for seamless light/dark mode switching
  - `@media (prefers-color-scheme: dark)` support for system-level theme detection
  - Clean, modern color palette optimized for both modes
  - Smooth transitions between theme states

- **Full Size Button for Exported Pages** - View each scraped page in fullscreen
  - Dedicated "Full Size" button next to expand/collapse toggle
  - Fullscreen iframe overlay covering entire viewport
  - Doesn't open external links - keeps everything in single export file
  - Toggle between normal and full size view instantly

- **Clean UI Styling** - Minimalistic design with consistent aesthetics
  - Unified color scheme using CSS variables
  - Subtle borders and shadows for depth
  - Optimized button sizing and spacing
  - Professional typography and layout

### 🔧 Changed

- Updated version to 0.8.4 across all files (manifest.json, CLI tools, installer, build scripts)
- Enhanced HTML export with system-aware theming
- Improved button controls for better user experience

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
  - **Firefox Add-ons API Token Support** for automated AMO publishing
    - Uses JWT API credentials (FIREFOX_JWT_ISSUER, FIREFOX_JWT_SECRET) for secure submission
    - Falls back to legacy API key if JWT unavailable
    - Clear instructions for obtaining credentials from Mozilla Developer Hub
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
