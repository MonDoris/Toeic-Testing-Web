@echo off
chcp 65001 >nul
title Bubble Sheet - TOEIC
cd /d "%~dp0"

where dotnet >nul 2>nul || (echo [LOI] Chua cai .NET SDK 9 tro len: https://dotnet.microsoft.com/download & pause & exit /b 1)

if not exist "src\ToeicPractice.Api\wwwroot\index.html" (
  where npm >nul 2>nul || (echo [LOI] Chua cai Node.js: https://nodejs.org & pause & exit /b 1)
  echo === Dang build giao dien React (lan dau) ===
  pushd client
  call npm install || (popd & pause & exit /b 1)
  call npm run build || (popd & pause & exit /b 1)
  popd
)

echo === Dang khoi dong server: http://localhost:5076 ===
start "" cmd /c "timeout /t 8 >nul & start http://localhost:5076"
dotnet run --project src\ToeicPractice.Api --launch-profile http
pause
