param([Parameter(Mandatory=$true)][string]$Path)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($Path)
[pscustomobject]@{target=$shortcut.TargetPath; arguments=$shortcut.Arguments} | ConvertTo-Json -Compress
