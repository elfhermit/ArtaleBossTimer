param(
  [string]$Target = "docs",   # 目標資料夾 ("docs" 或 "public")
  [switch]$NoClean            # 如果提供 --NoClean 則不清空目標資料夾（僅覆寫）
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$Src = Join-Path $RepoRoot "src"
$Dest = Join-Path $RepoRoot $Target

if (-not (Test-Path $Src)) {
  Write-Error "Source folder not found: $Src"
  exit 1
}

# 視情況清空目標資料夾（預設會清空以保證乾淨）
if (Test-Path $Dest -and -not $NoClean) {
  Write-Host "Removing existing target folder: $Dest"
  Remove-Item -Path $Dest -Recurse -Force -ErrorAction Stop
}

# 建立目標
if (-not (Test-Path $Dest)) {
  New-Item -ItemType Directory -Path $Dest | Out-Null
}

Write-Host "Copying files from `"$Src`" -> `"$Dest`" ..."

# 複製所有檔案/資料夾（保留結構）
Get-ChildItem -Path $Src -Force | ForEach-Object {
  $srcPath = $_.FullName
  $destPath = Join-Path $Dest $_.Name

  if ($_.PSIsContainer) {
    Copy-Item -Path $srcPath -Destination $destPath -Recurse -Force -ErrorAction Stop
  } else {
    Copy-Item -Path $srcPath -Destination $destPath -Force -ErrorAction Stop
  }
}

Write-Host "Sync complete: $Src -> $Dest"
exit 0
