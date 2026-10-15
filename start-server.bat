@echo off
chcp 65001 >nul
title DigSite Gesture Archaeology Website - Launcher
cd /d "%~dp0"

echo ==============================================
echo    DigSite Gesture Archaeology Website
echo    Starting local server, browser opens soon...
echo ==============================================
echo.
echo    Keep this window open. Closing it stops the site.
echo    URL: http://localhost:8766/index.html
echo.
echo    [1] Open palm + wave   : sweep the dirt off
echo    [2] Make a fist        : detect the relic
echo.

rem wait 2 seconds for the server, then open the browser
start "" /min cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8766/index.html"

rem start the local static server (stays in the foreground)
python -m http.server 8766

echo.
echo Server stopped.
pause
