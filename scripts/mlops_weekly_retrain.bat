@echo off
rem ==============================================================================
rem Script: mlops_weekly_retrain.bat
rem Muc dich: Runner tu dong thuc thi quy trinh tai huan luyen MLOps dinh ky cuoi tuan
rem ==============================================================================

chcp 65001 > nul
setlocal EnableDelayedExpansion

rem Lay duong dan tuyet doi cua thu muc chua script va thu muc goc du an
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%.."
set PROJECT_DIR=%CD%

set LOG_FILE=%PROJECT_DIR%\data_mining\models\model_registry\mlops_weekly_run.log

echo ============================================================================== >> "%LOG_FILE%" 2>&1
echo [MLOps Schedule] Session started at: %DATE% %TIME% >> "%LOG_FILE%" 2>&1
echo Project directory: %PROJECT_DIR% >> "%LOG_FILE%" 2>&1

rem Thuc thi pipeline tai huan luyen MLOps doc lap
py data_mining\models\mlops_retrain_pipeline.py >> "%LOG_FILE%" 2>&1
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% EQU 0 (
    echo [MLOps Schedule] Session completed SUCCESS at: %DATE% %TIME% >> "%LOG_FILE%" 2>&1
) else (
    echo [MLOps Schedule] Session FAILED with exit code: %EXIT_CODE% at: %DATE% %TIME% >> "%LOG_FILE%" 2>&1
)
echo ============================================================================== >> "%LOG_FILE%" 2>&1

exit /b %EXIT_CODE%
