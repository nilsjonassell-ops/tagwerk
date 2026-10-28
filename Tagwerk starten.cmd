@echo off
title Tagwerk
cd /d "%~dp0"

rem --- Node.js pruefen, bei Bedarf ueber winget installieren ---
where node >nul 2>nul
if errorlevel 1 goto install_node
goto have_node

:install_node
echo Node.js ist nicht installiert. Es wird jetzt ueber winget installiert.
echo Bitte bestaetige gleich die Abfragen ^(Lizenz und Windows-Administratorfenster^).
winget install --id OpenJS.NodeJS.LTS -e
if errorlevel 1 goto node_failed
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto node_failed
goto have_node

:node_failed
echo.
echo Node.js konnte nicht automatisch installiert werden.
echo Bitte installiere die LTS-Version von https://nodejs.org und starte diese Datei erneut.
pause
exit /b 1

:have_node
for /f "delims=" %%v in ('node -v') do echo Node.js %%v gefunden.

rem --- Beim ersten Start Abhaengigkeiten installieren ---
if exist "node_modules\electron\package.json" goto check_electron
echo.
echo Erster Start: Abhaengigkeiten werden installiert. Das dauert einige Minuten ...
call npm.cmd install
if errorlevel 1 goto npm_failed

:check_electron
rem Electron laedt sein Programm separat herunter; falls das fehlt, gezielt nachholen.
if exist "node_modules\electron\dist\electron.exe" goto run
echo.
echo Electron wird heruntergeladen ^(ca. 100 MB^) ...
node node_modules\electron\install.js
if not exist "node_modules\electron\dist\electron.exe" goto electron_failed

:run
echo.
echo Tagwerk wird gestartet. Dieses Fenster bitte offen lassen, solange du Tagwerk nutzt.
call npm.cmd run dev
if errorlevel 1 goto run_failed
exit /b 0

:run_failed
echo.
echo Tagwerk wurde mit einem Fehler beendet. Die Meldung steht oben.
pause
exit /b 1

:electron_failed
echo.
echo Electron konnte nicht heruntergeladen werden. Falls ein VPN aktiv ist, kurz trennen und die Datei erneut starten.
pause
exit /b 1

:npm_failed
echo.
echo Die Installation der Abhaengigkeiten ist fehlgeschlagen. Pruefe deine Internetverbindung und starte die Datei erneut.
pause
exit /b 1
