' Startet Tagwerk ohne Konsolenfenster (Ziel der Desktop-Verknuepfung).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
exe = dir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(exe) Then
  MsgBox "Electron fehlt noch. Bitte einmal ""Tagwerk starten.cmd"" ausfuehren.", 48, "Tagwerk"
  WScript.Quit 1
End If
If Not fso.FileExists(dir & "\out\renderer\index.html") Then
  rc = sh.Run("cmd /c npm.cmd run build > build.log 2>&1", 0, True)
  If rc <> 0 Then
    MsgBox "Tagwerk konnte nicht gebaut werden. Details: build.log", 16, "Tagwerk"
    WScript.Quit 1
  End If
End If
sh.Environment("Process")("ELECTRON_ENABLE_LOGGING") = "1"
sh.Run "cmd /c """"" & exe & """ """ & dir & """ > """ & dir & "\tagwerk.log"" 2>&1""", 0, False
