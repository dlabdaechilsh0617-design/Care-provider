@echo off
setlocal
set "NODE_EXE=%LOCALAPPDATA%\ms-playwright-go\1.57.0\node.exe"
set "NPM_CLI=%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Community\MSBuild\Microsoft\VisualStudio\NodeJs\node_modules\npm\bin\npm-cli.js"
if not exist "%NODE_EXE%" set "NODE_EXE=%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Community\MSBuild\Microsoft\VisualStudio\NodeJs\win-x64\node.exe"
if not exist "%NPM_CLI%" (
  echo npm CLI was not found.
  exit /b 1
)
if not exist "%NODE_EXE%" (
  echo Node.js runtime was not found.
  exit /b 1
)
"%NODE_EXE%" "%NPM_CLI%" %*
