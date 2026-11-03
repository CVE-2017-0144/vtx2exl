@echo off
cd /d "%~dp0"
if not exist ..\vtx2exl.exe (
  call ..\src\build.bat || exit /b 1
  cd /d "%~dp0"
  copy /y ..\src\vtx2exl.exe .. >nul || exit /b 1
)
if not exist node_modules\ink call bun install || exit /b 1
del ..\VTX2EXL-UI.exe 2>nul
if exist ..\VTX2EXL-UI.exe echo VTX2EXL-UI.exe locked, close it & exit /b 1
start "" /low /wait /b bun build.mjs
if not exist ..\VTX2EXL-UI.exe exit /b 1
