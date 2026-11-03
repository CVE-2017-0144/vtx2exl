@echo off
for /f "usebackq delims=" %%i in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -property installationPath`) do set "VS=%%i"
call "%VS%\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
cd /d "%~dp0"
ml64 /nologo /c /Fo crc32c.obj crc32c.asm || exit /b 1
cl /nologo /std:c++20 /O2 /EHsc /W4 /utf-8 vtx2exl.cpp crc32c.obj /Fe:vtx2exl.exe || exit /b 1
