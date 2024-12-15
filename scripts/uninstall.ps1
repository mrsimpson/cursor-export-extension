# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Please run this script as Administrator!" -ForegroundColor Red
    exit 1
}

# 设置错误操作
$ErrorActionPreference = "Stop"

# 检查 Cursor 进程
$cursorProcess = Get-Process | Where-Object { $_.ProcessName -like "*cursor*" }
if ($cursorProcess) {
    Write-Host "Please close Cursor IDE first!" -ForegroundColor Red
    exit 1
}

# 定义安装路径
$extensionPath = "C:\Users\$env:USERNAME\AppData\Local\Programs\cursor\resources\app\extensions\cursor-tools.cursor-export-extension-0.0.1"

# 删除扩展
if (Test-Path $extensionPath) {
    Write-Host "Removing extension..." -ForegroundColor Yellow
    try {
        Remove-Item -Path $extensionPath -Recurse -Force
        Write-Host "Extension removed successfully!" -ForegroundColor Green
    }
    catch {
        Write-Host "Failed to remove: $_" -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host "Extension not installed" -ForegroundColor Yellow
}

# 清理编译输出
if (Test-Path "out") {
    Write-Host "Cleaning build output..." -ForegroundColor Yellow
    Remove-Item -Path "out" -Recurse -Force
}

# 清理打包文件
Get-ChildItem -Path "." -Filter "*.vsix" | ForEach-Object {
    Write-Host "Removing package file: $($_.Name)" -ForegroundColor Yellow
    Remove-Item $_.FullName -Force
}

Write-Host "Uninstall completed!" -ForegroundColor Green 