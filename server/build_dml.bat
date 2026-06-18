@echo off
setlocal enabledelayedexpansion

echo ===============================================
echo Voice Changer DML Build Script
echo ===============================================
echo.

REM Set environment variable for DML backend
set BACKEND=dml

REM Check if dist directory exists
if not exist "..\client\modern-gui\dist" (
    echo Error: Frontend dist not found at ..\client\modern-gui\dist
    echo Please build the frontend first:
    echo   cd ..\client\modern-gui
    echo   npm install
    echo   npm run build
    pause
    exit /b 1
)

echo Using DML backend, frontend dist found.
echo.

REM Clean previous build
if exist "dist" (
    echo Cleaning previous build...
    rmdir /s /q dist
)
if exist "build" (
    rmdir /s /q build
)

REM Run PyInstaller
echo Building executable... This may take 10-20 minutes.
echo.

& "d:\AI_ollama\voice-changer\.conda\python.exe" -m PyInstaller --clean -y --dist ./dist --workpath ./build MMVCServerSIO.spec

if %errorlevel% neq 0 (
    echo.
    echo ===============================================
    echo Build FAILED!
    echo ===============================================
    pause
    exit /b 1
)

REM Copy additional Windows scripts
if exist "force_gpu_clocks.bat" (
    copy /Y force_gpu_clocks.bat dist\MMVCServerSIO\ >nul
)
if exist "reset_gpu_clocks.bat" (
    copy /Y reset_gpu_clocks.bat dist\MMVCServerSIO\ >nul
)

echo.
echo ===============================================
echo Build completed successfully!
echo ===============================================
echo.
echo Output directory: %CD%\dist\MMVCServerSIO
echo Executable: %CD%\dist\MMVCServerSIO\MMVCServerSIO.exe
echo.
echo You can distribute the entire MMVCServerSIO folder.
echo Python environment is bundled - no need to install Python on target machines.
echo.
pause
