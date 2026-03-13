@echo off
REM ══════════════════════════════════════════════════════════════
REM WebScraper Pro - Auto Installer (Windows 10/11)
REM Installs the Python CLI and sets up the Firefox extension
REM ══════════════════════════════════════════════════════════════

echo.
echo ╔══════════════════════════════════════════╗
echo ║      WebScraper Pro - Auto Installer     ║
echo ╚══════════════════════════════════════════╝
echo.

set SCRIPT_DIR=%~dp0

REM ── Check Python ──
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found!
    echo.
    echo Please install Python 3.8+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PY_VERSION=%%i
echo [INFO] Python version: %PY_VERSION%

REM ── Create virtual environment ──
set VENV_DIR=%USERPROFILE%\.webscraper-pro\venv
if not exist "%VENV_DIR%" (
    echo [INFO] Creating virtual environment...
    python -m venv "%VENV_DIR%"
)

REM ── Activate venv ──
call "%VENV_DIR%\Scripts\activate.bat"

REM ── Install CLI dependencies ──
echo [INFO] Installing CLI dependencies...
pip install --upgrade pip setuptools wheel >nul 2>&1
cd /d "%SCRIPT_DIR%cli"
pip install -e . 2>nul || pip install click rich requests beautifulsoup4 huggingface-hub Pillow pydub tqdm

REM ── Create scrape.cmd wrapper ──
set LOCAL_BIN=%USERPROFILE%\.local\bin
if not exist "%LOCAL_BIN%" mkdir "%LOCAL_BIN%"

echo @echo off > "%LOCAL_BIN%\scrape.cmd"
echo call "%VENV_DIR%\Scripts\activate.bat" >> "%LOCAL_BIN%\scrape.cmd"
echo python "%SCRIPT_DIR%cli\scrape.py" %%* >> "%LOCAL_BIN%\scrape.cmd"

echo [OK] CLI installed!

REM ── Generate icons ──
echo [INFO] Generating extension icons...
cd /d "%SCRIPT_DIR%"
python extension\icons\generate_icons.py 2>nul

REM ── Package extension ──
echo [INFO] Packaging extension...
cd /d "%SCRIPT_DIR%extension"
if exist "%SCRIPT_DIR%webscraper-pro.xpi" del "%SCRIPT_DIR%webscraper-pro.xpi"
powershell -Command "Compress-Archive -Path * -DestinationPath '%SCRIPT_DIR%webscraper-pro.zip' -Force" 2>nul
if exist "%SCRIPT_DIR%webscraper-pro.zip" (
    ren "%SCRIPT_DIR%webscraper-pro.zip" webscraper-pro.xpi
    echo [OK] Extension packaged: %SCRIPT_DIR%webscraper-pro.xpi
)
cd /d "%SCRIPT_DIR%"

echo.
echo ╔══════════════════════════════════════════╗
echo ║    Installation Complete!                ║
echo ╚══════════════════════════════════════════╝
echo.
echo Quick start:
echo   scrape --help          Show all commands
echo   scrape start           Start a scraping session
echo   scrape config.upload   Configure HuggingFace
echo.
echo Firefox extension:
echo   Load from: %SCRIPT_DIR%extension\manifest.json
echo.
echo NOTE: Add %LOCAL_BIN% to your system PATH for the 'scrape' command.
echo.
pause
