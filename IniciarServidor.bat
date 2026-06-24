@echo off
title Servidor SOP Induwell
echo ========================================================
echo  Iniciando Servidor de Planeacion SOP Induwell...
echo ========================================================
python -u "%~dp0server.py"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un problema al iniciar el servidor de Python.
    echo Asegurate de que Python este instalado y en tu variable de entorno PATH.
    echo.
    pause
)
