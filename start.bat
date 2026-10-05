@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"
  if not errorlevel 1 (
    py -3 app.py %*
    goto end
  )
)
where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"
  if not errorlevel 1 (
    python app.py %*
    goto end
  )
)
echo Python 3.10 or newer is required. Install Python and add it to PATH.
:end
pause
