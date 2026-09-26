@echo off
setlocal
cd /d "%~dp0"
set "PORT=8123"

start "游戏服务（关闭此窗口即停止）" python -m http.server %PORT% --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/index.html"
