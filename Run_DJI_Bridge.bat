@echo off
title DJI RC-N1C Simulator Bridge
:: Change directory to where the batch script resides so files are resolved correctly
cd /d "%~dp0"

echo ====================================================
echo     DJI RC-N1C SIMULATOR LAUNCHER SERVICE
echo ====================================================
echo.
echo 🚀 Launching Visualizer Dashboard in your browser...
start http://localhost:8080

echo ⚡ Starting Python Bridge Service...
echo.
python dji_bridge.py

echo.
echo ====================================================
echo     Bridge Service Closed.
echo ====================================================
pause
