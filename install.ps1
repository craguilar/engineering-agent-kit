# Wrapper for the cross-platform Python installer. Pass through normal installer arguments.
$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot 'scripts/install.py'
if (Get-Command py -ErrorAction SilentlyContinue) {
  & py -3 $installer @args
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  & python $installer @args
} else {
  throw 'Python 3.11+ is required. Install Python, then retry.'
}
exit $LASTEXITCODE
