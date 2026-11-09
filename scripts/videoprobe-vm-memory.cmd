@echo off
setlocal
rem CanvaCraft V2 export memory trace for the 8GB VM. Double-click to run (about 20 minutes).
rem Same folder layout as videoprobe-vm-test.cmd: canvacraft\ and node\ next to this file.
rem Keep this file ASCII only: cmd misreads multibyte text in batch files.

set "SRC=%~dp0"
set "WORK=%USERPROFILE%\canvacraft-v2"
set "NODEDIR=%USERPROFILE%\canvacraft-v2-node"
set "OUTDIR=%SRC%results-%COMPUTERNAME%"
if not defined PAIR set "PAIR=webm"
if not defined SECONDS set "SECONDS=600"
if not defined LABEL set "LABEL=vm"

echo.
echo [1/3] Copying test files to this PC's disk...
robocopy "%SRC%canvacraft" "%WORK%" /MIR /XD artifacts test-results /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto copyfail
robocopy "%SRC%node" "%NODEDIR%" /MIR /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto copyfail

set "PATH=%NODEDIR%;%PATH%"
cd /d "%WORK%"

echo.
echo [2/3] Running the memory trace: %PAIR%, %SECONDS% seconds, Microsoft Edge.
echo       Edge windows will open and close. Do not close them and do not click the buttons.
echo.
node node_modules\@playwright\test\cli.js test --config playwright.video-phase2.config.ts memory --project msedge --reporter=list --timeout=0
set "RESULT=%ERRORLEVEL%"

echo.
echo [3/3] Copying results to %OUTDIR%
robocopy "%WORK%\artifacts\video-phase2" "%OUTDIR%" memory-*.json /NFL /NDL /NJH /NJS /NP >nul

echo.
if "%RESULT%"=="0" (echo DONE. Memory trace finished.) else (echo DONE. The trace failed. Please capture this window.)
echo Results folder: %OUTDIR%
pause
exit /b %RESULT%

:copyfail
echo Copy failed. Check that the shared folder is connected.
pause
exit /b 1
