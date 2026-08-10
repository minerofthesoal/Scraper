#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# WebScraper Pro v0.8.0 - Auto XPI Builder
# Packages the Firefox extension into a .xpi file
# Usage: ./build_xpi.sh [--output PATH]
# ══════════════════════════════════════════════════════════════

set -euo pipefail

BLUE='\033[1;34m'
GREEN='\033[1;32m'
RED='\033[1;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"
OUTPUT="$SCRIPT_DIR/webscraper-pro.xpi"

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output|-o) OUTPUT="$2"; shift 2 ;;
        *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
    esac
done

echo -e "${BLUE}[BUILD]${NC} Packaging WebScraper Pro extension..."

# Validate extension directory
if [[ ! -f "$EXT_DIR/manifest.json" ]]; then
    echo -e "${RED}[ERROR]${NC} manifest.json not found in $EXT_DIR"
    exit 1
fi

# Read version from manifest
VERSION=$(grep -o '"version": *"[^"]*"' "$EXT_DIR/manifest.json" | head -1 | grep -o '"[^"]*"$' | tr -d '"')
echo -e "${BLUE}[BUILD]${NC} Version: $VERSION"

# Generate icons if missing
if [[ ! -f "$EXT_DIR/icons/icon-48.png" ]]; then
    echo -e "${BLUE}[BUILD]${NC} Generating extension icons..."
    if [[ -f "$EXT_DIR/icons/generate_icons.py" ]]; then
        python3 "$EXT_DIR/icons/generate_icons.py" 2>/dev/null || true
    fi
fi

# Remove old XPI
[[ -f "$OUTPUT" ]] && rm -f "$OUTPUT"

# Build XPI (zip of extension directory)
cd "$EXT_DIR"
zip -r "$OUTPUT" . \
    -x "*.py" \
    -x "__pycache__/*" \
    -x "*.pyc" \
    -x ".DS_Store" \
    -x "*.swp" \
    -x "*.swo" \
    -x "*~" \
    -x ".git/*" \
    -x "node_modules/*" \
    2>/dev/null
cd "$SCRIPT_DIR"

if [[ -f "$OUTPUT" ]]; then
    SIZE=$(du -h "$OUTPUT" | cut -f1)
    echo -e "${GREEN}[OK]${NC} Built: $OUTPUT ($SIZE)"
    echo -e "${GREEN}[OK]${NC} Version: $VERSION"
    echo ""
    echo "Install in Firefox:"
    echo "  about:addons -> gear icon -> Install Add-on From File -> select $OUTPUT"
else
    echo -e "${RED}[ERROR]${NC} Failed to create XPI"
    exit 1
fi
