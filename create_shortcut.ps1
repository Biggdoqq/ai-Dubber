$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop 'AI Video Dubber Pro.lnk'
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = 'C:\Users\heang\Desktop\AI_Video_Dubber_Clean\Launch App.bat'
$Shortcut.WorkingDirectory = 'C:\Users\heang\Desktop\AI_Video_Dubber_Clean'
$Shortcut.IconLocation = 'C:\Users\heang\Desktop\AI_Video_Dubber_Clean\icons\icon.ico'
$Shortcut.Description = 'AI Video Dubber Pro — Desktop App'
$Shortcut.WindowStyle = 7
$Shortcut.Save()
Write-Host 'Desktop shortcut created successfully!'
