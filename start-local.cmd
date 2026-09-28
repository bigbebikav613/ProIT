@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Virtual environment not found: .venv
  echo Create it with: py -m venv .venv
  pause
  exit /b 1
)

start "ProIT API" /D "%~dp0" ".venv\Scripts\python.exe" api_server.py
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000/"

echo ProIT started at http://127.0.0.1:8000/
echo Close the "ProIT API" window to stop the server.
endlocal
