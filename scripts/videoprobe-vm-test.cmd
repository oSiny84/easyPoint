@echo off
setlocal
rem CanvaCraft V2 video test for the 8GB VM. Double-click to run.
rem Copies files to the local disk, runs the test with Edge, then copies results back next to this file.
rem Keep this file ASCII only: cmd misreads multibyte text in batch files.

set "SRC=%~dp0"
set "WORK=%USERPROFILE%\canvacraft-v2"
set "NODEDIR=%USERPROFILE%\canvacraft-v2-node"
set "OUTDIR=%SRC%results-%COMPUTERNAME%"
if not defined MINUTES set "MINUTES=10"

echo.
echo [1/3] Copying test files to this PC's disk. This can take a few minutes...
robocopy "%SRC%canvacraft" "%WORK%" /MIR /XD artifacts test-results /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto copyfail
robocopy "%SRC%node" "%NODEDIR%" /MIR /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto copyfail

set "PATH=%NODEDIR%;%PATH%"
cd /d "%WORK%"

echo.
echo [2/3] Running the video test: %MINUTES%-minute video, Microsoft Edge.
echo       Edge windows will open and close. Do not close them and do not click the buttons.
echo       The page may only show its ready text while work runs in the background.
echo.
node node_modules\@playwright\test\cli.js test --config playwright.video-phase2.config.ts support export --project msedge --reporter=list --timeout=0
set "RESULT=%ERRORLEVEL%"

echo.
echo [3/3] Copying results to %OUTDIR%
robocopy "%WORK%\artifacts\video-phase2" "%OUTDIR%" /E /XD files /NFL /NDL /NJH /NJS /NP >nul
systeminfo > "%OUTDIR%\systeminfo.txt" 2>nul
echo exit code %RESULT% > "%OUTDIR%\exit-code.txt"

echo.
if "%RESULT%"=="0" (echo DONE. All tests passed.) else (echo DONE. Some tests failed. Please capture this window.)
echo Results folder: %OUTDIR%
pause
exit /b %RESULT%

:copyfail
echo Copy failed. Check that the shared folder is connected.
pause
exit /b 1
