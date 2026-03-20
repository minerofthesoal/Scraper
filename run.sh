#!/usr/bin/env bash
# ── WebScraper Pro v0.7 - Run Script ──
# Launches the AI server and opens Firefox for the extension
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}╔═══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   WebScraper Pro v0.7 - Runner        ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════╝${NC}"
echo

# Find venv
VENV_DIR="$HOME/.webscraper-pro/venv"
if [ ! -d "$VENV_DIR" ]; then
    VENV_DIR="$SCRIPT_DIR/.webscraper-pro/venv"
fi

if [ ! -d "$VENV_DIR" ]; then
    echo -e "${RED}Virtual environment not found. Run install.sh first.${NC}"
    exit 1
fi

source "$VENV_DIR/bin/activate"

# Parse arguments
MODE="${1:-serve}"
shift 2>/dev/null || true

case "$MODE" in
    serve|ai)
        echo -e "${CYAN}Starting AI server...${NC}"
        echo -e "  ${YELLOW}Press Ctrl+C to stop${NC}"
        echo
        python "$SCRIPT_DIR/cli/scrape.py" ai.serve "$@"
        ;;
    setup)
        echo -e "${CYAN}Running AI setup...${NC}"
        echo
        python "$SCRIPT_DIR/cli/scrape.py" ai.setup "$@"
        ;;
    doctor)
        echo -e "${CYAN}Running system diagnostics...${NC}"
        echo
        python "$SCRIPT_DIR/cli/scrape.py" doctor
        ;;
    status)
        echo -e "${CYAN}Checking status...${NC}"
        echo
        python "$SCRIPT_DIR/cli/scrape.py" status
        ;;
    help|--help|-h)
        echo "Usage: ./run.sh [command] [options]"
        echo
        echo "Commands:"
        echo "  serve    Start the AI extraction server (default)"
        echo "  setup    Download and configure the AI model"
        echo "  doctor   Run system diagnostics"
        echo "  status   Show current status"
        echo "  help     Show this help message"
        echo
        echo "Options (passed to ai.serve):"
        echo "  --gpu    Force GPU mode"
        echo "  --cpu    Force CPU mode"
        echo "  -p PORT  Set server port (default: 8377)"
        echo
        echo "Examples:"
        echo "  ./run.sh                 Start AI server (auto-detect GPU)"
        echo "  ./run.sh serve --gpu     Start AI server with GPU"
        echo "  ./run.sh setup           Download AI model"
        echo "  ./run.sh setup --cpu     Setup for CPU-only"
        ;;
    *)
        # Pass through to scrape CLI
        python "$SCRIPT_DIR/cli/scrape.py" "$MODE" "$@"
        ;;
esac
