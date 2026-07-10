# CAP CLAIR repo cleanup helper
# À lancer depuis la racine du repo local.
# Ne supprime pas .git.

$ErrorActionPreference = "Stop"

$patterns = @(
  "DEV*_REPORT.md",
  "DEV*.md",
  "dist",
  "node_modules",
  ".vite",
  ".DS_Store",
  "Thumbs.db"
)

foreach ($pattern in $patterns) {
  Get-ChildItem -Path . -Force -Name $pattern -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_ -ne ".git") {
      Remove-Item -Path $_ -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host "Removed $_"
    }
  }
}

Write-Host "Cleanup done. .git preserved."
