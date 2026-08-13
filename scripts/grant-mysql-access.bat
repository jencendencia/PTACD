@echo off
REM ============================================================
REM  PTA CD - one-time database setup (run ONCE on the MySQL server)
REM
REM  Creates the network account 'pta' (password "joel") that every
REM  PTA CD computer uses to connect to the shared tapin_school
REM  database. This file must sit next to grant-mysql-access.sql.
REM
REM  Usage: double-click this file, then enter the MySQL root
REM  password when prompted.
REM ============================================================
setlocal

set "SQLFILE=%~dp0grant-mysql-access.sql"

if not exist "%SQLFILE%" (
    echo ERROR: grant-mysql-access.sql was not found next to this batch file.
    echo Expected: %SQLFILE%
    pause
    exit /b 1
)

REM --- Locate the mysql client (PATH first, then Program Files\MySQL) ---
set "MYSQL=mysql"
where mysql >nul 2>nul
if not errorlevel 1 goto :run

for %%D in ("%ProgramFiles%\MySQL" "%ProgramFiles(x86)%\MySQL") do (
    if exist "%%~D" (
        for /r "%%~D" %%F in (mysql.exe) do (
            if exist "%%F" set "MYSQL=%%F"
        )
    )
)

if "%MYSQL%"=="mysql" (
    echo ERROR: could not find mysql.exe on the PATH or in %%ProgramFiles%%\MySQL.
    echo Install the MySQL client, or edit this file and set MYSQL=C:\path\to\mysql.exe
    pause
    exit /b 1
)

:run
echo Using: %MYSQL%
echo.
echo This will create the 'pta'@'%%' account with password "joel" and grant
echo it access to the tapin_school database.
echo.
echo Enter the MySQL ROOT password when prompted (it is not echoed).
echo.
"%MYSQL%" -u root -p < "%SQLFILE%"
set "RC=%errorlevel%"
echo.
if %RC% equ 0 (
    echo Done! The network account is ready:
    echo   DB_USER=pta   DB_PASSWORD=joel   DB_NAME=tapin_school
    echo Every PTA CD computer can now connect using this server's LAN IP.
) else (
    echo The command failed with exit code %RC%. Check the message above
    echo (wrong root password, or MySQL is not listening on this machine).
)
pause
