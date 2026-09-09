@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap\check-env.ps1"
exit /b %ERRORLEVEL%
