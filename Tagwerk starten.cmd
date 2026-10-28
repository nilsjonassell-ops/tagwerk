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
if exist ".electron-download\p00" goto electron_local
echo.
echo Electron wird heruntergeladen ^(ca. 150 MB^) ...
node node_modules\electron\install.js
if not exist "node_modules\electron\dist\electron.exe" goto electron_failed
goto run

:electron_local
rem Electron wurde vorab in Teilen bereitgestellt: zusammensetzen, pruefen, entpacken.
echo.
echo Electron wird eingerichtet ...
> start.log echo Electron lokal einrichten %date% %time%
pushd .electron-download
copy /b p00+p01+p02+p03+p04+p05+p06+p07+p08+p09+p10+p11+p12+p13+p14+p15 electron.zip >> ..\start.log 2>&1
certutil -hashfile electron.zip SHA256 | findstr /i "55eaba17abff7b5bba6c3bbc85068967379024fe742fe9c7fdba9118922ccbe2" >nul
if errorlevel 1 (popd & >> start.log echo Pruefsumme falsch & goto electron_failed)
>> ..\start.log echo Pruefsumme ok
popd
if exist "node_modules\electron\dist" rmdir /s /q "node_modules\electron\dist"
mkdir "node_modules\electron\dist"
tar -xf ".electron-download\electron.zip" -C "node_modules\electron\dist" >> start.log 2>&1
if not exist "node_modules\electron\dist\electron.exe" (>> start.log echo Entpacken fehlgeschlagen & goto electron_failed)
<nul set /p "=electron.exe" > "node_modules\electron\path.txt"
rmdir /s /q .electron-download
>> start.log echo Electron bereit

:run
echo.
echo Tagwerk wird gestartet. Dieses Fenster bitte offen lassen, solange du Tagwerk nutzt.
>> start.log echo Starte Tagwerk %time%
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
