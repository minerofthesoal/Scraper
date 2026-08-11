# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.4.1] - 2025-01-XX

### ✨ New Features

1. **Smart Focus Mode**
   - Automatically detects and highlights the main content area of any webpage
   - Uses advanced heuristics to identify article text, product details, and key information
   - One-click focus mode removes distractions for better reading and scraping
   - Intelligent section detection for multi-part articles

2. **One-Click Markdown Copy**
   - Instantly copy scraped content as formatted Markdown
   - Preserves headings, lists, links, and code blocks
   - Perfect for pasting into notes apps, documentation, or AI tools
   - Smart formatting that adapts to content type

### 🔧 Improvements

1. **Complete Dark/Light Theme System**
   - Automatic system theme detection via `prefers-color-scheme`
   - Three-way toggle: Light / Dark / Auto (system-follow)
   - Minimalistic color palette optimized for both modes
   - Smooth transitions between themes
   - Applied to popup, options page, GWSS interface, and exported HTML files

2. **Enhanced Full HTML Export**
   - Exported pages now match extension theme (dark/light auto-detection)
   - CSS variables for consistent theming across all components
   - Improved iframe styling with proper background colors
   - Better visual hierarchy in exported documents

3. **Fixed Iframe Content Rendering**
   - Resolved issue where exported iframes were missing CSS and JavaScript
   - Preserved all inline styles and scripts during export
   - Removed aggressive whitespace normalization that broke rendering
   - All captured pages now render identically to originals

### 📦 Technical Updates

- Updated version strings across all files (manifest.json, CLI, installer, build script)
- Popup theme toggle now shows icons: ☀️ (light), ☾ (dark), ⚡ (auto)
- Background storage properly persists theme preferences
- Exported HTML footer updated to v0.8.4.1

---

## [0.8.4] - 2025-01-XX

### ✨ New Features

- **Full Multi-Page HTML Export**: Single self-contained HTML file with all captured pages embedded as iframes using data URLs
- **Full Size Toggle Button**: Dedicated button to view each captured page in fullscreen overlay without opening external links
- **Simultaneous Multi-Tab Scraping**: All tabs scraped in parallel with configuration passthrough

### 🔧 Improvements

- Dark-first theme with light mode toggle
- "Capture Full HTML" checkbox in popup UI
- Content script enhanced to accept config overrides
- Professional UI with collapsible sections and navigation header

---

## [0.8.3] - 2025-01-XX

### ✨ New Features

- Automated GitHub Actions build & release pipeline
- Firefox Add-ons publishing with JWT authentication
- Python CLI package distribution (.whl, .tar.gz)

### 🔧 Improvements

- Version synchronization across all files
- Comprehensive changelog following Keep a Changelog format
- Error handling in CI/CD workflow

---

[Unreleased]: https://github.com/minerofthesoal/Scraper/compare/v0.8.4.1...HEAD
[0.8.4.1]: https://github.com/minerofthesoal/Scraper/compare/v0.8.4...v0.8.4.1
[0.8.4]: https://github.com/minerofthesoal/Scraper/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/minerofthesoal/Scraper/releases/tag/v0.8.3
