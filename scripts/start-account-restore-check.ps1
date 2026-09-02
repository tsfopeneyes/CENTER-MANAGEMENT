#Requires -Version 7.0
param([string]$BackupPath)
$ErrorActionPreference = 'Stop'
$restoreBase = Join-Path $env:LOCALAPPDATA 'SCI-Center-Backups'
$restoreBackup = if ($BackupPath) { [IO.Path]::GetFullPath($BackupPath) } else {
    (Get-ChildItem -LiteralPath $restoreBase -Directory |
        Where-Object Name -Match '^backup-' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1).FullName
}
if (-not $restoreBackup -or (Split-Path -Parent $restoreBackup) -ne $restoreBase -or
    (Split-Path -Leaf $restoreBackup) -notmatch '^backup-') { throw 'Invalid restore backup' }
if ((Get-Item -LiteralPath $restoreBase).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Invalid restore base' }
$restoreWork = Join-Path $restoreBase ('restore-check-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $restoreWork | Out-Null
$restoreAcl = [System.Security.AccessControl.DirectorySecurity]::new()
$restoreAcl.SetAccessRuleProtection($true, $false)
$restoreOwner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$restoreAcl.SetOwner($restoreOwner)
foreach ($restorePrincipal in @($restoreOwner, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $restoreAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($restorePrincipal,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
        [System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow))
}
Set-Acl -LiteralPath $restoreWork -AclObject $restoreAcl
Write-Host '운영 DB에는 접속하지 않습니다. 복원 자료는 현재 사용자/SYSTEM만 접근 가능한 로컬 폴더에 둡니다.'
Write-Host '기존 백업 암호를 입력하세요. 새 암호를 정하거나 DB 비밀번호를 입력하는 단계가 아닙니다.'
& node (Join-Path $PSScriptRoot 'verify-account-backup-restore.mjs') $restoreBackup $restoreWork
Read-Host '확인 후 Enter로 닫기' | Out-Null
