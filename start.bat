@echo off
rem Double-click (or run from cmd) to start the betting API and the game together.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 pause
