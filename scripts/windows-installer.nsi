Unicode true
Name "Agilize PTZ Controls"
OutFile "../dist/Agilize-PTZ-Controls-Setup-1.8.0.exe"
InstallDir "$LOCALAPPDATA\Programs\Agilize PTZ Controls"
RequestExecutionLevel user
SetCompressor zlib
Icon "../assets/icon.ico"
UninstallIcon "../assets/icon.ico"
VIProductVersion "1.8.0.0"
VIAddVersionKey "ProductName" "Agilize PTZ Controls"
VIAddVersionKey "FileDescription" "Instalador Agilize PTZ Controls"
VIAddVersionKey "FileVersion" "1.8.0"
VIAddVersionKey "LegalCopyright" "Agilize; derivado de Panevo, MIT"
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles
Section
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "../out/Agilize PTZ Controls-win32-x64/*"
  CreateShortcut "$DESKTOP\Agilize PTZ Controls.lnk" "$INSTDIR\Agilize PTZ Controls.exe"
  CreateDirectory "$SMPROGRAMS\Agilize PTZ Controls"
  CreateShortcut "$SMPROGRAMS\Agilize PTZ Controls\Agilize PTZ Controls.lnk" "$INSTDIR\Agilize PTZ Controls.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AgilizePTZControls" "DisplayName" "Agilize PTZ Controls"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AgilizePTZControls" "DisplayVersion" "1.8.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AgilizePTZControls" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AgilizePTZControls" "DisplayIcon" "$INSTDIR\Agilize PTZ Controls.exe"
  Exec '"$INSTDIR\Agilize PTZ Controls.exe"'
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\Agilize PTZ Controls.lnk"
  RMDir /r "$SMPROGRAMS\Agilize PTZ Controls"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AgilizePTZControls"
  RMDir /r "$INSTDIR"
SectionEnd
