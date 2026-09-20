@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto check
where py >nul 2>nul
if errorlevel 1 goto python
py -3 -m venv .venv
if errorlevel 1 goto failed
goto install
:python
where python >nul 2>nul
if errorlevel 1 goto missing
python -m venv .venv
if errorlevel 1 goto failed
:install
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto failed
:check
.venv\Scripts\python.exe -c "import fastapi,uvicorn,PIL,natsort,multipart,pypdf,pypdfium2,reportlab,cryptography,argon2" >nul 2>nul
if errorlevel 1 goto install
.venv\Scripts\python.exe run.py
if errorlevel 1 goto failed
goto end
:missing
echo Install Python 3.11 or newer from python.org, then run this file again.
pause
exit /b 1
:failed
echo Setup or startup failed. Check the message above. First setup needs internet.
pause
exit /b 1
:end
endlocal
