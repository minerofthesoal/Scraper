#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# WebScraper Pro v0.6.3b3 - Auto Installer (Linux / macOS)
# Installs the Python CLI and sets up the Firefox extension
# Works on: Arch, Ubuntu, Debian, Fedora, macOS, and more
# ══════════════════════════════════════════════════════════════

set -euo pipefail

BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    WebScraper Pro v0.6.3b3 - Auto Installer  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Detect OS ──
detect_os() {
    if [[ -f /etc/arch-release ]]; then
        echo "arch"
    elif [[ -f /etc/debian_version ]]; then
        echo "debian"
    elif [[ -f /etc/fedora-release ]]; then
        echo "fedora"
    elif [[ -f /etc/redhat-release ]]; then
        echo "rhel"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    else
        echo "unknown"
    fi
}

OS=$(detect_os)
info "Detected OS: $OS"

# ── Install system dependencies ──
install_system_deps() {
    info "Installing system dependencies..."

    case $OS in
        arch)
            sudo pacman -S --noconfirm --needed python python-pip ffmpeg 2>/dev/null || true
            ;;
        debian)
            sudo apt-get update -qq
            sudo apt-get install -y python3 python3-pip python3-venv ffmpeg 2>/dev/null || true
            ;;
        fedora)
            sudo dnf install -y python3 python3-pip ffmpeg 2>/dev/null || true
            ;;
        rhel)
            sudo yum install -y python3 python3-pip ffmpeg 2>/dev/null || true
            ;;
        macos)
            if command -v brew &>/dev/null; then
                brew install python ffmpeg 2>/dev/null || true
            else
                warn "Homebrew not found. Please install Python 3 and ffmpeg manually."
            fi
            ;;
        *)
            warn "Unknown OS. Please ensure Python 3, pip, and ffmpeg are installed."
            ;;
    esac
}

# ── Check Python ──
check_python() {
    if command -v python3 &>/dev/null; then
        PYTHON=python3
    elif command -v python &>/dev/null; then
        PYTHON=python
    else
        err "Python not found! Installing..."
        install_system_deps
        PYTHON=python3
    fi

    PY_VERSION=$($PYTHON --version 2>&1 | awk '{print $2}')
    info "Python version: $PY_VERSION"

    # Check minimum version
    PY_MAJOR=$($PYTHON -c "import sys; print(sys.version_info.major)")
    PY_MINOR=$($PYTHON -c "import sys; print(sys.version_info.minor)")
    if [[ "$PY_MAJOR" -lt 3 ]] || { [[ "$PY_MAJOR" -eq 3 ]] && [[ "$PY_MINOR" -lt 8 ]]; }; then
        err "Python 3.8+ required (found $PY_VERSION)"
        exit 1
    fi
}

# ── Install CLI ──
install_cli() {
    info "Installing WebScraper Pro CLI..."

    cd "$SCRIPT_DIR/cli"

    # Create virtual environment (use --global flag to skip)
    if [[ "${1:-}" != "--global" ]]; then
        VENV_DIR="$HOME/.webscraper-pro/venv"
        if [[ ! -d "$VENV_DIR" ]]; then
            info "Creating virtual environment at $VENV_DIR..."
            $PYTHON -m venv "$VENV_DIR"
        fi
        source "$VENV_DIR/bin/activate"
        PYTHON="$VENV_DIR/bin/python"
        PIP="$VENV_DIR/bin/pip"
    else
        PIP="$PYTHON -m pip"
    fi

    # Install dependencies
    $PIP install --upgrade pip setuptools wheel 2>/dev/null
    $PIP install -e . 2>/dev/null || $PIP install click rich requests beautifulsoup4 huggingface-hub Pillow pydub tqdm

    # Create symlink for easy access
    SCRAPE_BIN="$VENV_DIR/bin/scrape"
    if [[ -f "$SCRAPE_BIN" ]]; then
        LOCAL_BIN="$HOME/.local/bin"
        mkdir -p "$LOCAL_BIN"
        ln -sf "$SCRAPE_BIN" "$LOCAL_BIN/scrape" 2>/dev/null || true
        ok "CLI installed! Command: scrape"
        info "Make sure $LOCAL_BIN is in your PATH"
    else
        # Direct script fallback
        LOCAL_BIN="$HOME/.local/bin"
        mkdir -p "$LOCAL_BIN"
        cat > "$LOCAL_BIN/scrape" << SCRIPT
#!/bin/bash
source "$VENV_DIR/bin/activate"
python "$SCRIPT_DIR/cli/scrape.py" "\$@"
SCRIPT
        chmod +x "$LOCAL_BIN/scrape"
        ok "CLI installed via wrapper script: $LOCAL_BIN/scrape"
    fi

    cd "$SCRIPT_DIR"
}

# ── Setup Firefox Extension ──
setup_extension() {
    info "Setting up Firefox extension..."

    # Generate icons if needed
    if [[ ! -f "$SCRIPT_DIR/extension/icons/icon-48.png" ]]; then
        info "Generating extension icons..."
        $PYTHON "$SCRIPT_DIR/extension/icons/generate_icons.py"
    fi

    # Find Firefox profiles
    FIREFOX_PROFILES=""
    if [[ -d "$HOME/.mozilla/firefox" ]]; then
        FIREFOX_PROFILES="$HOME/.mozilla/firefox"
    elif [[ -d "$HOME/snap/firefox/common/.mozilla/firefox" ]]; then
        FIREFOX_PROFILES="$HOME/snap/firefox/common/.mozilla/firefox"
    elif [[ -d "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox" ]]; then
        FIREFOX_PROFILES="$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox"
    fi

    if [[ -n "$FIREFOX_PROFILES" ]]; then
        ok "Firefox profiles found at: $FIREFOX_PROFILES"
        echo ""
        echo -e "${YELLOW}To install the extension in Firefox:${NC}"
        echo "  1. Open Firefox"
        echo "  2. Navigate to: about:debugging#/runtime/this-firefox"
        echo "  3. Click 'Load Temporary Add-on'"
        echo "  4. Select: $SCRIPT_DIR/extension/manifest.json"
        echo ""
        echo -e "${YELLOW}For permanent installation:${NC}"
        echo "  1. Navigate to: about:addons"
        echo "  2. Click the gear icon -> 'Install Add-on From File'"
        echo "  3. Select the extension .xpi file (after packaging)"
        echo ""
    else
        warn "Firefox profiles not found. Install Firefox first."
    fi

    # Package extension as .xpi (zip)
    info "Packaging extension as .xpi..."
    cd "$SCRIPT_DIR/extension"
    zip -r "$SCRIPT_DIR/webscraper-pro.xpi" . -x "*.py" -x "__pycache__/*" -x "*.pyc" -x ".DS_Store" 2>/dev/null || true
    cd "$SCRIPT_DIR"

    if [[ -f "$SCRIPT_DIR/webscraper-pro.xpi" ]]; then
        ok "Extension packaged: $SCRIPT_DIR/webscraper-pro.xpi"
    fi
}

# ── Verify Installation ──
verify_install() {
    info "Verifying installation..."
    local checks=0
    local passed=0

    # Check CLI
    checks=$((checks + 1))
    if command -v scrape &>/dev/null; then
        ok "CLI is accessible"
        passed=$((passed + 1))
    else
        err "CLI not found in PATH"
    fi

    # Check version
    checks=$((checks + 1))
    if scrape --version &>/dev/null; then
        ok "CLI runs correctly ($(scrape --version 2>/dev/null | head -1))"
        passed=$((passed + 1))
    else
        err "CLI failed to execute"
    fi

    # Check extension
    checks=$((checks + 1))
    if [[ -f "$SCRIPT_DIR/extension/manifest.json" ]]; then
        ok "Extension manifest present"
        passed=$((passed + 1))
    else
        err "Extension manifest missing"
    fi

    # Check XPI
    checks=$((checks + 1))
    if [[ -f "$SCRIPT_DIR/webscraper-pro.xpi" ]]; then
        ok "XPI package built ($(du -h "$SCRIPT_DIR/webscraper-pro.xpi" | cut -f1))"
        passed=$((passed + 1))
    else
        warn "XPI not built"
    fi

    echo ""
    if [[ $passed -eq $checks ]]; then
        ok "All $checks checks passed!"
    else
        warn "$passed/$checks checks passed"
    fi
}

# ── Main ──
main() {
    check_python
    install_system_deps
    install_cli "${1:-}"
    setup_extension

    echo ""
    verify_install

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║      Installation Complete!                   ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Quick start:"
    echo "  scrape -h              Show all commands"
    echo "  scrape start           Start a scraping session"
    echo "  scrape url <URL>       Scrape a URL directly"
    echo "  scrape config.upload   Configure HuggingFace"
    echo "  scrape status          Check status"
    echo "  scrape doctor          Check system health"
    echo "  scrape gui.start       Launch the GUI"
    echo ""
    echo "Update:      scrape -U"
    echo "Uninstall:   scrape -rmv"
    echo ""
    echo "Firefox extension:"
    echo "  Load from: $SCRIPT_DIR/extension/manifest.json"
    echo ""
}

main "$@"
