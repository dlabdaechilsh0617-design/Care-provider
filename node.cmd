@echo off
setlocal
set "NODE_EXE=%LOCALAPPDATA%\ms-playwright-go\1.57.0\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Community\MSBuild\Microsoft\VisualStudio\NodeJs\win-x64\node.exe"
if not exist "%NODE_EXE%" (
  echo Node.js runtime was not found.
  exit /b 1
)
"%NODE_EXE%" %*
