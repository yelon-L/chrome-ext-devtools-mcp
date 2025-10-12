@echo off
setlocal

:: Chrome DevTools MCP Windows 启动脚本

cd /d "%~dp0\.."

echo.
echo ============================================================
echo   Chrome DevTools MCP 启动
echo ============================================================
echo.

:: 检查是否已编译
if not exist "build" (
  echo 📦 首次运行，正在安装依赖并编译...
  call npm install
  call npm run build
  echo.
)

:: 检查 Chrome 是否运行
curl -s http://localhost:9222/json/version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo ✅ 检测到 Chrome 正在运行
) else (
  echo ⚠️  未检测到 Chrome ^(端口 9222^)
  echo.
  echo 请先启动 Chrome:
  echo   chrome.exe --remote-debugging-port=9222
  echo.
  echo 或使用 --start-chrome 参数自动启动
  echo.
  pause
)

echo.
echo 🚀 启动 Chrome DevTools MCP...
echo.

:: 启动 MCP 服务器
node build\src\index.js %*
