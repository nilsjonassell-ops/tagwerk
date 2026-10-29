@echo off
rem Legt "Tagwerk" auf dem Desktop und im Startmenue an und startet die App.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d='%~dp0'.TrimEnd('\'); $ws=New-Object -ComObject WScript.Shell;" ^
  "foreach($f in @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) ''))){" ^
  " $l=$ws.CreateShortcut((Join-Path $f 'Tagwerk.lnk'));" ^
  " $l.TargetPath=(Join-Path $env:WINDIR 'System32\wscript.exe');" ^
  " $l.Arguments='\"'+(Join-Path $d 'Tagwerk.vbs')+'\"';" ^
  " $l.WorkingDirectory=$d; $l.IconLocation=(Join-Path $d 'resources\icon.ico')+',0';" ^
  " $l.Description='Tagwerk'; $l.Save() }"
if errorlevel 1 (echo Verknuepfung konnte nicht erstellt werden. & pause & exit /b 1)
start "" wscript.exe "%~dp0Tagwerk.vbs"
