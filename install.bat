@echo off
REM ══════════════════════════════════════════════════════════════
REM WebScraper Pro v0.6.3b4.1 - Auto Installer (Windows 10/11)
REM Installs the Python CLI and sets up the Firefox extension
REM ══════════════════════════════════════════════════════════════

echo.
echo ╔══════════════════════════════════════════════╗
echo ║    WebScraper Pro v0.6.3b4.1 - Auto Installer  ║
echo ╚══════════════════════════════════════════════╝
echo.

set SCRIPT_DIR=%~dp0

REM ── Check Python ──
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found!
    echo.
    echo Please install Python 3.10-3.12 from https://www.python.org/downloads/
    echo PyTorch does NOT support Python 3.13+. Use 3.10, 3.11, or 3.12.
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PY_VERSION=%%i
echo [INFO] Python version: %PY_VERSION%

REM ── Find compatible Python (3.10-3.12 for PyTorch) ──
set COMPAT_PYTHON=python
set FOUND_COMPAT=0

REM Try specific versions first
for %%v in (3.12 3.11 3.10) do (
    where python%%v >nul 2>&1
    if !errorlevel! equ 0 (
        if !FOUND_COMPAT! equ 0 (
            set COMPAT_PYTHON=python%%v
            set FOUND_COMPAT=1
            echo [OK] Found compatible Python %%v
        )
    )
)

REM Check if default python is in range
if %FOUND_COMPAT% equ 0 (
    for /f %%m in ('python -c "import sys; print(sys.version_info.minor)"') do set PY_MINOR=%%m
    if %PY_MINOR% GEQ 10 if %PY_MINOR% LEQ 12 (
        set FOUND_COMPAT=1
    )
    if %FOUND_COMPAT% equ 0 (
        echo [WARN] Python %PY_VERSION% detected. PyTorch requires Python 3.10-3.12.
        echo [WARN] AI features will not work. Install Python 3.10-3.12 for full support.
    )
)

REM ── Create virtual environment ──
set VENV_DIR=%USERPROFILE%\.webscraper-pro\venv
if not exist "%VENV_DIR%" (
    echo [INFO] Creating virtual environment...
    %COMPAT_PYTHON% -m venv "%VENV_DIR%"
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

REM ── Verify Installation ──
echo.
echo [INFO] Verifying installation...
scrape --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] CLI is working
) else (
    echo [WARN] CLI not found in PATH. Add %LOCAL_BIN% to your PATH.
)

echo.
echo ╔══════════════════════════════════════════════╗
echo ║      Installation Complete!                   ║
echo ╚══════════════════════════════════════════════╝
echo.
echo Quick start:
echo   scrape -h              Show all commands
echo   scrape start           Start a scraping session
echo   scrape url ^<URL^>       Scrape a URL directly
echo   scrape config.upload   Configure HuggingFace
echo   scrape doctor          Check system health
echo   scrape gui.start       Launch the GUI
echo.
echo Update:      scrape -U
echo Uninstall:   scrape -rmv
echo.
echo Firefox extension:
echo   Load from: %SCRIPT_DIR%extension\manifest.json
echo.
echo NOTE: Add %LOCAL_BIN% to your system PATH for the 'scrape' command.
echo.
pause
