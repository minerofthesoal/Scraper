#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# WebScraper Pro v0.8.0 - Auto Installer
# Downloads, installs the CLI, and builds the XPI in one step.
# Usage: curl -fsSL <url>/auto_install.sh | bash
#   or:  ./auto_install.sh [--cli-only] [--dir PATH]
# ══════════════════════════════════════════════════════════════

set -euo pipefail

BLUE='\033[1;34m'
GREEN='\033[1;32m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO_URL="https://github.com/minerofthesoal/Scraper.git"
INSTALL_DIR="${HOME}/Scraper"
CLI_ONLY=false

# ── Parse args ──
while [[ $# -gt 0 ]]; do
    case "$1" in
        --cli-only)  CLI_ONLY=true; shift ;;
        --dir)       INSTALL_DIR="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--cli-only] [--dir PATH]"
            echo "  --cli-only  Install only the Python CLI (skip XPI build)"
            echo "  --dir PATH  Clone into PATH (default: ~/Scraper)"
            exit 0 ;;
        *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
    esac
done

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ── Check prerequisites ──
command -v git  >/dev/null 2>&1 || fail "git is required. Install it first."
command -v pip3 >/dev/null 2>&1 || command -v pip >/dev/null 2>&1 || fail "pip is required. Install Python 3.10+ first."

PIP="pip3"
command -v pip3 >/dev/null 2>&1 || PIP="pip"

PYTHON="python3"
command -v python3 >/dev/null 2>&1 || PYTHON="python"

# Verify Python version >= 3.10
PY_VER=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
if [[ "$PY_MAJOR" -lt 3 ]] || { [[ "$PY_MAJOR" -eq 3 ]] && [[ "$PY_MINOR" -lt 10 ]]; }; then
    fail "Python 3.10+ is required (found $PY_VER). Install a newer Python."
fi
ok "Python $PY_VER"

# ── Clone or update repo ──
if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Updating existing clone at $INSTALL_DIR"
    git -C "$INSTALL_DIR" pull --ff-only origin main 2>/dev/null || git -C "$INSTALL_DIR" pull --ff-only 2>/dev/null || true
else
    info "Cloning WebScraper Pro into $INSTALL_DIR"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
ok "Repository ready at $INSTALL_DIR"

# ── Install Python CLI ──
info "Installing CLI package..."
$PIP install "$INSTALL_DIR/cli" --quiet 2>&1 | tail -5
ok "CLI installed"

# ── Verify CLI works ──
if command -v scrape >/dev/null 2>&1; then
    ok "scrape command available: $(scrape --version 2>/dev/null || echo 'installed')"
else
    # Might be in ~/.local/bin
    if [[ -f "$HOME/.local/bin/scrape" ]]; then
        warn "scrape installed to ~/.local/bin — add it to your PATH:"
        echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
fi

# ── Build XPI ──
if [[ "$CLI_ONLY" = false ]]; then
    info "Building Firefox extension (.xpi)..."
    if [[ -f "$INSTALL_DIR/build_xpi.sh" ]]; then
        chmod +x "$INSTALL_DIR/build_xpi.sh"
        bash "$INSTALL_DIR/build_xpi.sh"
    else
        # Fallback: build manually
        cd "$INSTALL_DIR/extension"
        zip -r "$INSTALL_DIR/webscraper-pro.xpi" . \
            -x "*.py" -x "__pycache__/*" -x "*.pyc" -x ".DS_Store" 2>/dev/null
        cd "$INSTALL_DIR"
        ok "Built webscraper-pro.xpi"
    fi
fi

# ── Done ──
echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  WebScraper Pro installed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo "  CLI:       scrape --version"
echo "  GUI:       scrape gui.start"
echo "  Doctor:    scrape doctor"
echo "  Update:    scrape -U"
echo "  Uninstall: scrape -rmv"
if [[ "$CLI_ONLY" = false ]]; then
    echo ""
    echo "  Extension: $INSTALL_DIR/webscraper-pro.xpi"
    echo "  Install in Firefox: about:addons -> gear -> Install Add-on From File"
fi
echo ""
