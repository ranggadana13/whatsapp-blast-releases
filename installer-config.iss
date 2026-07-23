; =====================================================================
; INNO SETUP CONFIGURATION FOR REPLIX AI DESKTOP (1-CLICK SETUP)
; =====================================================================
#define MyAppName "REPLIX AI"
#define MyAppVersion "1.0.2"
#define MyAppPublisher "Rangga Dana"
#define MyAppURL "https://github.com/ranggadana13/whatsapp-blast-releases"
#define MyAppExeName "Launcher.exe"

[Setup]
AppId={{C82F1943-41A8-43B0-874C-97C5B56E74B0}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\REPLIXAI
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=dist
OutputBaseFilename=Setup-REPLIX-AI-v1.0.2
SetupIconFile=build\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "Launcher.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "server.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "db.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "main.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "google-apps-script-fix.gs"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\*"; DestDir: "{app}\build"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "bin\*"; DestDir: "{app}\bin"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "node_modules\*" ; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "electron,electron-builder,app-builder-bin,app-builder-lib,7zip-bin"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\build\icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\build\icon.ico"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
