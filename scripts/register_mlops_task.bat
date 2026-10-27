@echo off
rem ==============================================================================
rem Script: register_mlops_task.bat
rem Muc dich: Huong dan & Cong cu dang ky lich huan luyen MLOps tren Windows Task Scheduler
rem ==============================================================================

chcp 65001 > nul
setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
set TASK_NAME=WarehouseManagement_MLOps_Weekly_Retrain
set SCRIPT_PATH=%SCRIPT_DIR%mlops_weekly_retrain.bat

if "%1"=="install" goto INSTALL
if "%1"=="run" goto RUN_NOW
if "%1"=="status" goto STATUS
if "%1"=="uninstall" goto UNINSTALL

:HELP
echo ==============================================================================
echo HUONG DAN SU DUNG CONG CU DANG KY MLOPS TASK SCHEDULER (WINDOWS)
echo ==============================================================================
echo   1. Dang ky chay tu dong vao 02:00 sang Chu Nhat hang tuan:
echo      scripts\register_mlops_task.bat install
echo.
echo   2. Chay thu nghiem ngay lap tuc:
echo      scripts\register_mlops_task.bat run
echo.
echo   3. Kiem tra trang thai tac vu:
echo      scripts\register_mlops_task.bat status
echo.
echo   4. Huy dang ky tac vu:
echo      scripts\register_mlops_task.bat uninstall
echo ==============================================================================
goto END

:INSTALL
echo [*] Dang dang ky tac vu '%TASK_NAME%' vao Task Scheduler...
schtasks /create /tn "%TASK_NAME%" /tr "\"%SCRIPT_PATH%\"" /sc weekly /d SUN /st 02:00 /f
if %ERRORLEVEL% EQU 0 (
    echo [OK] Dang ky thanh cong! Tac vu se tu dong chay vao 02:00 sang Chu Nhat hang tuan.
) else (
    echo [LOI] Khong the dang ky. Vui long kiem tra quyen Administrator.
)
goto END

:RUN_NOW
echo [*] Kich hoat chay thu tac vu '%TASK_NAME%'...
schtasks /run /tn "%TASK_NAME%"
goto END

:STATUS
echo [*] Kiem tra trang thai tac vu '%TASK_NAME%'...
schtasks /query /tn "%TASK_NAME%" /fo LIST /v
goto END

:UNINSTALL
echo [*] Huy dang ky tac vu '%TASK_NAME%'...
schtasks /delete /tn "%TASK_NAME%" /f
goto END

:END
